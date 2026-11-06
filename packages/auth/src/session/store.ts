import { createJsonCodec, decodeResponseFailure, HttpError } from "@plainworks/http"
import { createStore, type Store } from "@plainworks/state"
import { FailureDecodeError, type ProblemDecoder, RemoteFailure } from "@plainworks/std/failure"
import type { RandomSource } from "@plainworks/std/random"
import {
  AbortError,
  type Delay,
  isRetryable,
  NetworkError,
  RetryError,
  type RetryPolicy,
  raceAbort,
  runWithRetry,
  systemDelay,
  withTimeout,
} from "@plainworks/std/resilience"
import type { AuthContext, AuthHeaders, Identity, ProtectedSession } from "@plainworks/std/seam"
import { type Clock, systemClock } from "@plainworks/std/time"
import {
  resolveFetch,
  type WebAbortController,
  type WebAbortSignal,
  type WebFetch,
  type WebRequestInit,
} from "@plainworks/std/web"
import { AuthError } from "../errors"
import { sessionFailureReasons, sessionFailures } from "./failures"
import { decodeSessionResponse, type SessionResponse } from "./response"

// The longest session the server issues, and how far its `Date` header may trail the moment it
// set a fresh session's expiry. `Date` has one-second resolution, and servers cache it and refresh
// it on their event loop, so a busy server can stamp a time more than a second old.
const SESSION_LIFETIME_MS = 3_600_000
const SERVER_DATE_LAG_MS = 5_000

// A status check is a read, so a slow or failed one is retried a few times before the session is
// marked unconfirmed. Each attempt keeps its one-second bound.
const STATUS_ATTEMPT_MS = 1000
const STATUS_RETRY: RetryPolicy = {
  maxAttempts: 3,
  budgetMs: 5000,
  idempotent: true,
  backoff: { baseMs: 100, maxMs: 400, factor: 2, jitter: "full" },
}

/**
 * Client-safe state. The HttpOnly credential is never represented here. `unconfirmed` means a
 * status check failed without the server rejecting the session (timeout, network, outage):
 * protected work is stopped, the last known identity stays for display (`null` when no check has
 * answered yet), and the next status check can confirm it again.
 */
export interface SessionSnapshot {
  readonly status: "authenticated" | "unconfirmed" | "unauthenticated"
  readonly identity: Identity | null
  readonly expiresAt?: string
  readonly error?: Error
  readonly revocation?: "confirmed" | "unconfirmed"
}

export interface SessionLogin {
  readonly username: string
  readonly password: string
}

export interface AuthStoreConfig {
  readonly fetch?: WebFetch
  /** Same-origin auth route prefix; defaults to `/auth`. */
  readonly baseUrl?: string
  readonly clock?: Clock
  readonly delay?: Delay
  /** Jitter for status-check retries; defaults to the system RNG. */
  readonly random?: RandomSource
  /**
   * The server-rendered state, for hydration only; it never certifies a protected operation. A
   * signed-out seed is the server's answer, so {@link AuthStore.confirm} does not ask again.
   */
  readonly initialSnapshot?: SessionSnapshot
  /** Reads a rejected session route. Defaults to {@link sessionFailures}. */
  readonly failures?: ProblemDecoder
}

export interface AuthStore {
  readonly store: Store<SessionSnapshot>
  readonly protectedSession: ProtectedSession
  getSnapshot(): SessionSnapshot
  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void
  /** CSRF only, never Authorization or browser-readable credentials. */
  getAuthHeader(context?: AuthContext): Promise<AuthHeaders>
  login(input: SessionLogin, signal?: WebAbortSignal): Promise<void>
  revalidate(context?: AuthContext): Promise<void>
  /**
   * The root owner's mount check: revalidate a signed-in or missing seed, and resolve at once for a
   * signed-out seed. Signing in replaces it through a server render or `login`.
   */
  confirm(): Promise<void>
  /** Local teardown is immediate; rejection means server revocation is unconfirmed. */
  logout(signal?: WebAbortSignal): Promise<void>
  /**
   * Stop owned work: status and queued or in-flight mutations, the expiry timer, and protected
   * lifetimes. The displayed snapshot stays. Not terminal: a later `revalidate` or `login` starts
   * again, so a root owner can close on every effect cleanup.
   */
  close(): void
}

/** A decoded session plus the server's time when it answered. */
interface Received {
  readonly session: SessionResponse
  readonly serverNow: number
}

/**
 * Opaque same-origin cookie session lifecycle; mutations serialize without retry. One root owner
 * calls `confirm` once mounted and `close` on teardown; providers and transports only borrow it.
 */
export function createAuthStore(config: AuthStoreConfig = {}): AuthStore {
  const clock = config.clock ?? systemClock
  const delay = config.delay ?? systemDelay
  const fetch = resolveFetch(config.fetch, () => new AuthError("auth/config", "fetch is required"))
  const baseUrl = (config.baseUrl ?? "/auth").replace(/\/$/, "")
  const codec = createJsonCodec({ maxBytes: 16 * 1024 })
  const failures = config.failures ?? sessionFailures
  const store = createStore<SessionSnapshot>(
    () => config.initialSnapshot ?? { status: "unauthenticated", identity: null },
  )
  let generation = 0
  let blocked = false
  let owner = new AbortController()
  let credential: SessionResponse | undefined
  let csrfForLogout: string | undefined
  let lifetime = new AbortController()
  let expiry: WebAbortController | undefined
  let statusController: WebAbortController | undefined
  let statusFlight: Promise<void> | undefined
  let mutations: Promise<void> = Promise.resolve()
  let pendingMutations = 0

  function stopProtectedWork(error?: unknown): void {
    credential = undefined
    lifetime.abort(error)
    expiry?.abort()
    expiry = undefined
  }

  function asError(error: unknown): Error {
    return error instanceof Error
      ? error
      : new AuthError("auth/adapter", "session operation failed", { cause: error })
  }

  function clear(error?: unknown, revocation?: "confirmed" | "unconfirmed"): void {
    stopProtectedWork(error)
    store.setState(
      {
        status: "unauthenticated",
        identity: null,
        ...(error === undefined ? {} : { error: asError(error) }),
        ...(revocation === undefined ? {} : { revocation }),
      },
      true,
    )
  }

  // Only the server rejecting the session, or an answer we cannot trust, ends it. A check that
  // could not reach an answer is unconfirmed, keeps whatever identity is known (none before the
  // first answer) and leaves later checks allowed.
  function settleFailedStatus(cause: unknown): void {
    const identity = store.getState().identity
    if (couldNotConfirm(cause)) {
      stopProtectedWork(cause)
      store.setState({ status: "unconfirmed", identity, error: asError(cause) }, true)
      return
    }
    blocked = true
    clear(cause)
  }

  function fence(revocation?: "confirmed" | "unconfirmed"): number {
    generation++
    statusController?.abort()
    statusFlight = undefined
    clear(undefined, revocation)
    return generation
  }

  async function request(
    route: string,
    budget: number,
    init: WebRequestInit,
    signal: WebAbortSignal,
  ): Promise<Received | undefined> {
    return withTimeout(
      async (bounded) => {
        const response = await fetch(`${baseUrl}/${route}`, {
          ...init,
          credentials: "same-origin",
          redirect: "error",
          cache: "no-store",
          signal: bounded,
        })
        if (!response.ok) {
          throw await decodeResponseFailure(response, bounded, clock.now(), failures)
        }
        if (route === "logout") {
          if (response.status !== 204) throw new FailureDecodeError()
          return undefined
        }
        if (response.status !== 200) throw new FailureDecodeError()
        const serverNow = Date.parse(response.headers.get("date") ?? "")
        return {
          session: decodeSessionResponse(await codec.decode(response, bounded)),
          serverNow: Number.isNaN(serverNow) ? clock.now() : serverNow,
        }
      },
      budget,
      { signal, delay },
    )
  }

  // The server's clock is authoritative: lifetime is measured against its `Date`, so a skewed
  // browser clock neither ends a valid session nor extends an expired one. A lagging `Date` makes
  // a fresh session look slightly longer than its lifetime, hence the tolerance on the upper bound.
  function adopt({ session: value, serverNow }: Received): void {
    const remaining = Date.parse(value.expiresAt) - serverNow
    if (remaining <= 0 || remaining > SESSION_LIFETIME_MS + SERVER_DATE_LAG_MS) {
      throw new AuthError("auth/session-expired", "session expiry is outside its one-hour lifetime")
    }
    expiry?.abort()
    if (lifetime.signal.aborted) lifetime = new AbortController()
    credential = value
    blocked = false
    csrfForLogout = value.csrfToken
    // Arm the expiry timer before publishing authenticated state. A subscriber that tears the
    // session down during this synchronous publication aborts this exact timer through `close()`,
    // so no orphaned expiry timer outlives a session that closed mid-publication.
    const timer = new AbortController()
    expiry = timer
    delay(remaining, timer.signal).then(
      () => {
        if (expiry !== timer) return
        generation++
        blocked = true
        statusController?.abort()
        clear(new AuthError("auth/session-expired", "session expired"))
      },
      (cause: unknown) => {
        if (expiry !== timer || timer.signal.aborted) return
        generation++
        blocked = true
        statusController?.abort()
        clear(cause)
      },
    )
    store.setState(
      {
        status: "authenticated",
        identity: value.identity,
        expiresAt: value.expiresAt,
      },
      true,
    )
  }

  function revalidate(context?: AuthContext): Promise<void> {
    if (blocked) {
      const cause = store.getState().error
      if (cause instanceof RemoteFailure && !cause.retryable) return Promise.reject(cause)
      return Promise.reject(
        new RemoteFailure(
          "auth/session-ended",
          {
            ...(cause === undefined || cause instanceof AuthError
              ? { code: "unauthenticated", reason: sessionFailureReasons.invalid }
              : {
                  code: "unavailable",
                  reason: sessionFailureReasons.storeUnavailable,
                  authentication: "unavailable",
                }),
            message: cause === undefined ? "Sign in to continue." : cause.message,
            retryable: false,
            violations: [],
          },
          cause === undefined ? {} : { cause },
        ),
      )
    }
    if (statusFlight === undefined) {
      const epoch = generation
      const controller = new AbortController()
      statusController = controller
      const flight = runWithRetry(
        (_attempt, retrySignal) =>
          withTimeout(
            async (bounded) => {
              await raceAbort(mutations, bounded)
              if (epoch !== generation) throw new AbortError()
              return request("session", STATUS_ATTEMPT_MS, { method: "GET" }, bounded).catch(
                (cause: unknown) => {
                  if (cause instanceof TypeError && !bounded.aborted) {
                    throw new NetworkError("session status request failed", { cause })
                  }
                  throw cause
                },
              )
            },
            STATUS_ATTEMPT_MS,
            { signal: retrySignal, delay },
          ),
        STATUS_RETRY,
        {
          signal: controller.signal,
          delay,
          ...(config.random === undefined ? {} : { random: config.random }),
        },
      )
        .then((value) => {
          if (epoch !== generation) throw new AbortError()
          if (value === undefined) throw new FailureDecodeError()
          adopt(value)
        })
        .catch((cause: unknown) => {
          if (epoch === generation) settleFailedStatus(cause)
          throw cause
        })
      statusFlight = flight
      void flight
        .finally(() => {
          if (statusFlight === flight) {
            statusFlight = undefined
            statusController = undefined
          }
        })
        .catch(() => {})
    }
    return raceAbort(statusFlight, context?.signal)
  }

  function enqueue(
    operation: (epoch: number, signal: WebAbortSignal) => Promise<void>,
    revocation?: "unconfirmed",
  ): Promise<void> {
    if (pendingMutations >= 16) {
      if (revocation !== undefined) fence(revocation)
      return Promise.reject(new AuthError("auth/config", "session mutation queue is full"))
    }
    const epoch = fence(revocation)
    const signal = owner.signal
    pendingMutations++
    const result = mutations
      .then(() => {
        signal.throwIfAborted()
        return operation(epoch, signal)
      })
      .finally(() => {
        pendingMutations--
      })
    mutations = result.catch(() => {})
    return result
  }

  async function getAuthHeader(context?: AuthContext): Promise<AuthHeaders> {
    if (credential === undefined || Date.parse(credential.expiresAt) <= clock.now()) {
      await revalidate(context)
    }
    context?.signal?.throwIfAborted()
    if (credential === undefined) throw new AuthError("auth/unauthenticated", "no active session")
    return { "X-CSRF-Token": credential.csrfToken }
  }

  const protectedSession: ProtectedSession = {
    async acquire(context) {
      const epoch = generation
      const headers = await getAuthHeader(context)
      if (epoch !== generation) throw new AbortError()
      return { signal: lifetime.signal, headers, release: () => {} }
    },
    revalidate,
    invalidate(cause) {
      generation++
      blocked = true
      statusController?.abort()
      statusFlight = undefined
      clear(cause)
    },
  }

  return {
    store,
    protectedSession,
    getSnapshot: () => store.getState(),
    subscribe: (listener) => store.subscribe((state) => listener(state)),
    getAuthHeader,
    revalidate,
    confirm() {
      return config.initialSnapshot?.status === "unauthenticated" ? Promise.resolve() : revalidate()
    },
    login(input, signal) {
      if (signal?.aborted) return Promise.reject(new AbortError())
      const lifetimeOwner = owner.signal
      const mutation = enqueue(async (epoch, owned) => {
        const value = await request(
          "login",
          5000,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
          owned,
        )
        if (value === undefined) throw new FailureDecodeError()
        // Even a superseded login may have committed a cookie. The queued logout needs its CSRF.
        csrfForLogout = value.session.csrfToken
        if (epoch === generation) adopt(value)
      }).catch((cause: unknown) => {
        if (!lifetimeOwner.aborted && pendingMutations === 0) clear(cause)
        throw cause
      })
      return raceAbort(mutation, signal)
    },
    logout(signal) {
      blocked = true
      const mutation = enqueue(async (epoch, owned) => {
        try {
          await withTimeout(
            async (bounded) => {
              const prepare = async (): Promise<string> => {
                const value = await request("session", 1000, { method: "GET" }, bounded)
                if (value === undefined) throw new AuthError("auth/csrf", "no logout CSRF token")
                return value.session.csrfToken
              }
              const send = (proof: string) =>
                request(
                  "logout",
                  2000,
                  { method: "POST", headers: { "X-CSRF-Token": proof } },
                  bounded,
                )
              // A proof is spent once. Another tab may have rotated the shared cookie, so a cached
              // proof the server rejects is replaced once with the current session's proof.
              const cached = csrfForLogout
              csrfForLogout = undefined
              if (cached === undefined) {
                await send(await prepare())
                return
              }
              try {
                await send(cached)
              } catch (cause) {
                if (!(cause instanceof HttpError && cause.status === 403)) throw cause
                await send(await prepare())
              }
            },
            2000,
            { signal: owned, delay },
          )
          if (epoch === generation) clear(undefined, "confirmed")
        } catch (cause) {
          if (epoch === generation) clear(cause, "unconfirmed")
          throw cause
        }
      }, "unconfirmed")
      return raceAbort(mutation, signal)
    },
    close() {
      const closing = owner
      owner = new AbortController()
      closing.abort(new AbortError())
      generation++
      statusController?.abort()
      statusFlight = undefined
      credential = undefined
      lifetime.abort()
      expiry?.abort()
      expiry = undefined
    },
  }
}

function couldNotConfirm(cause: unknown): boolean {
  const last = cause instanceof RetryError ? cause.cause : cause
  return (
    (last instanceof RemoteFailure && last.authentication === "unavailable") || isRetryable(last)
  )
}
