import { createJsonCodec, decodeResponseFailure, HttpError } from "@plainworks/http"
import { createStore, type Store } from "@plainworks/state"
import { FailureDecodeError, RemoteFailure } from "@plainworks/std/failure"
import {
  AbortError,
  type Delay,
  raceAbort,
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
import { decodeSessionResponse, type SessionResponse } from "./response"

/** Client-safe state. The HttpOnly credential is never represented here. */
export interface SessionSnapshot {
  readonly status: "authenticated" | "unauthenticated"
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
  /**
   * The server-rendered state, for hydration only; it never certifies a protected operation. A
   * signed-out seed is the server's answer, so {@link AuthStore.confirm} does not ask again.
   */
  readonly initialSnapshot?: SessionSnapshot
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

  function clear(error?: unknown, revocation?: "confirmed" | "unconfirmed"): void {
    credential = undefined
    lifetime.abort(error)
    expiry?.abort()
    expiry = undefined
    store.setState(
      {
        status: "unauthenticated",
        identity: null,
        ...(error === undefined
          ? {}
          : {
              error:
                error instanceof Error
                  ? error
                  : new AuthError("auth/adapter", "session operation failed", { cause: error }),
            }),
        ...(revocation === undefined ? {} : { revocation }),
      },
      true,
    )
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
        if (!response.ok) throw await decodeResponseFailure(response, bounded, clock.now())
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
  // browser clock neither ends a valid session nor extends an expired one. `Date` has one-second
  // resolution, hence the tolerance on the upper bound.
  function adopt({ session: value, serverNow }: Received): void {
    const remaining = Date.parse(value.expiresAt) - serverNow
    if (remaining <= 0 || remaining > 3_601_000) {
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
            code:
              cause === undefined || cause instanceof AuthError
                ? "UNAUTHORIZED"
                : "SERVICE_UNAVAILABLE",
            message: cause === undefined ? "Sign in to continue." : cause.message,
            reason:
              cause === undefined || cause instanceof AuthError
                ? "SESSION_INVALID"
                : "AUTH_STORE_UNAVAILABLE",
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
      const flight = withTimeout(
        async (bounded) => {
          await raceAbort(mutations, bounded)
          if (epoch !== generation) throw new AbortError()
          const value = await request("session", 1000, { method: "GET" }, bounded)
          if (epoch !== generation) throw new AbortError()
          if (value === undefined) throw new FailureDecodeError()
          adopt(value)
        },
        1000,
        { signal: controller.signal, delay },
      ).catch((cause: unknown) => {
        if (epoch === generation) {
          blocked = true
          clear(cause)
        }
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
