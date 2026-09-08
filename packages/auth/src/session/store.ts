import { createStore, type Store } from "@plainworks/state"
import {
  type AuthContext,
  type AuthHeaders,
  type Clock,
  type Delay,
  type Identity,
  raceAbort,
  systemClock,
  type WebAbortController,
  type WebAbortSignal,
  withTimeout,
} from "@plainworks/std"

/**
 * The credential material a login or refresh yields. The access token is held **in memory only**
 * (the Token-Mediating-Backend fallback) — never written to `localStorage`/`sessionStorage` — and
 * `expiresAt` drives lazy refresh. `identity` is optional so a pure token refresh (identity
 * unchanged) can omit it and avoid a spurious session-change notification.
 */
export interface TokenSet {
  /** The bearer access token, held only in memory. */
  readonly accessToken: string
  /** Absolute expiry as epoch milliseconds, compared against the injected {@link Clock}. */
  readonly expiresAt: number
  /** The resolved caller, when this token set also (re)establishes identity. */
  readonly identity?: Identity | null
}

/**
 * Obtain a fresh {@link TokenSet}. Bound to `signal` so a request-scoped cancellation, a logout, or
 * the refresh deadline aborts the in-flight work — a well-behaved implementation passes `signal` to
 * its own `fetch`/awaits.
 */
export type RefreshFn = (signal: WebAbortSignal) => Promise<TokenSet>

/** The client-safe view of the session — identity and status only, never the token. */
export interface SessionSnapshot {
  /** `authenticated` once an identity is resolved; `unauthenticated` otherwise. */
  readonly status: "authenticated" | "unauthenticated"
  /** The resolved caller, or `null` when unauthenticated. */
  readonly identity: Identity | null
}

/** Construction options for {@link createAuthStore}. Every time/randomness input is injected. */
export interface AuthStoreConfig {
  /** How to obtain a fresh token when the current one is missing or (near-)expired. */
  readonly refresh?: RefreshFn
  /** Time source for all expiry math; defaults to the system clock. */
  readonly clock?: Clock
  /** Upper bound on a single refresh, after which it is abandoned so single-flight cannot wedge. */
  readonly refreshTimeoutMs?: number
  /** Refresh this many milliseconds *before* absolute expiry (lazy, on the next header read). */
  readonly expiryLeewayMs?: number
  /** Header name to carry the credential; defaults to `Authorization`. */
  readonly headerName?: string
  /** Auth scheme prefix; defaults to `Bearer`. */
  readonly scheme?: string
  /** Injectable delay backing the refresh deadline — deterministic under test. */
  readonly delay?: Delay
}

/**
 * The in-memory session core: it custodies the access token, tracks expiry against an injected
 * clock, de-duplicates concurrent refreshes (single-flight), and satisfies the `AuthHeaderProvider`
 * seam via {@link AuthStore.getAuthHeader}. The client-safe snapshot (identity + status) is published
 * through a `@plainworks/state` store so the same immutable-snapshot model backs the React binding.
 */
export interface AuthStore {
  /** The underlying snapshot store — fed to `toAdapter` for the React binding (client step). */
  readonly store: Store<SessionSnapshot>
  /** Read the current client-safe snapshot. */
  getSnapshot(): SessionSnapshot
  /** Observe session changes; returns an unsubscribe function. */
  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void
  /**
   * Resolve the current credential as headers, refreshing lazily when the token is missing or near
   * expiry. Degrades to `undefined` (never throws) so a transport owns the 401 decision; header-only.
   * A `context.signal` abort ends only this call's wait on a shared refresh — it never cancels that
   * refresh for other callers.
   */
  getAuthHeader(context?: AuthContext): Promise<AuthHeaders | undefined>
  /** Establish a session from a login result — supersedes any in-flight refresh. */
  setSession(tokens: TokenSet): void
  /** Clear the session and abort any in-flight refresh so a late result cannot resurrect it. */
  logout(): void
}

const DEFAULT_REFRESH_TIMEOUT_MS = 10_000
const DEFAULT_EXPIRY_LEEWAY_MS = 5_000

/**
 * Build an {@link AuthStore}. A factory, never a module-level singleton, so each request/tab gets its
 * own custody (SSR/RSC-safe).
 *
 * The session-lifetime invariants it upholds:
 *
 * - **Logout beats a late refresh.** Every mutation bumps a generation; a refresh adopts its result
 *   only while the generation is unchanged. `logout`/`setSession` bump the generation **and abort**
 *   the in-flight refresh, so a refresh that resolves after logout is dropped — the session stays
 *   cleared and no session-change fires.
 * - **A hung refresh is bounded.** The refresh runs under {@link withTimeout}; even one that ignores
 *   its signal is abandoned at the deadline, single-flight is released, and the next call retries.
 * - **A caller's cancellation is private.** The shared refresh is owned by the store, so a
 *   per-request `AuthContext.signal` only stops *that* caller awaiting it — it never aborts the
 *   refresh for the other in-flight callers, nor clears the session.
 */
export function createAuthStore(config: AuthStoreConfig = {}): AuthStore {
  const clock = config.clock ?? systemClock
  const refreshTimeoutMs = config.refreshTimeoutMs ?? DEFAULT_REFRESH_TIMEOUT_MS
  const expiryLeewayMs = config.expiryLeewayMs ?? DEFAULT_EXPIRY_LEEWAY_MS
  const headerName = config.headerName ?? "Authorization"
  const scheme = config.scheme ?? "Bearer"
  const refreshFn = config.refresh
  const delay = config.delay

  let accessToken: string | undefined
  let expiresAt: number | undefined
  let identity: Identity | null = null
  // The epoch every mutation bumps; a refresh result older than the current epoch is stale.
  let generation = 0
  // Single-flight: concurrent header reads share one refresh.
  let inflight: Promise<void> | undefined
  // Teardown handle for the in-flight refresh, aborted on logout/setSession (real cancellation).
  let inflightController: WebAbortController | undefined

  const store = createStore<SessionSnapshot>(() => ({ status: "unauthenticated", identity: null }))

  function publish(): void {
    store.setState({ status: identity !== null ? "authenticated" : "unauthenticated", identity })
  }

  function isFresh(): boolean {
    return (
      accessToken !== undefined &&
      expiresAt !== undefined &&
      clock.now() < expiresAt - expiryLeewayMs
    )
  }

  function headerFor(token: string | undefined): AuthHeaders | undefined {
    return token === undefined ? undefined : { [headerName]: `${scheme} ${token}` }
  }

  function abortInflight(): void {
    inflightController?.abort()
    inflight = undefined
    inflightController = undefined
  }

  function runRefresh(refresh: RefreshFn): Promise<void> {
    if (inflight !== undefined) {
      // Await the shared refresh; swallow its rejection (the primary caller records the failure).
      return inflight.then(
        () => undefined,
        () => undefined,
      )
    }
    const generationAtStart = generation
    const controller: WebAbortController = new AbortController()
    inflightController = controller
    // The refresh is bound only to the store-owned controller (aborted on logout/setSession) and its
    // own timeout — never to a caller's per-request signal, so one cancelled request cannot tear the
    // shared refresh down for the others.
    const attempt = withTimeout((signal) => refresh(signal), refreshTimeoutMs, {
      signal: controller.signal,
      ...(delay === undefined ? {} : { delay }),
    })
    const settled = attempt.then(
      (tokens) => {
        // A result from a superseded session (logout/new login intervened) is dropped.
        if (generationAtStart === generation) {
          applyTokens(tokens)
        }
      },
      () => {
        // A refresh aborted by logout/setSession bumped the generation and is dropped; a genuine
        // failure or timeout of the still-current session fails closed.
        if (generationAtStart === generation) {
          clearSession()
        }
      },
    )
    inflight = settled
    return settled.finally(() => {
      if (inflight === settled) {
        inflight = undefined
        inflightController = undefined
      }
    })
  }

  function applyTokens(tokens: TokenSet): void {
    accessToken = tokens.accessToken
    expiresAt = tokens.expiresAt
    if (tokens.identity !== undefined && tokens.identity !== identity) {
      identity = tokens.identity
      publish()
    }
  }

  function clearSession(): void {
    accessToken = undefined
    expiresAt = undefined
    if (identity !== null) {
      identity = null
      publish()
    }
  }

  async function getAuthHeader(context?: AuthContext): Promise<AuthHeaders | undefined> {
    if (isFresh()) {
      return headerFor(accessToken)
    }
    if (refreshFn !== undefined) {
      // Await the shared refresh, but let this caller's own signal end its wait early without
      // disturbing the store-owned refresh or the session. `raceAbort` rejects with `AbortError` on
      // that abort; the shared refresh never rejects, so nothing else reaches the catch.
      try {
        await raceAbort(runRefresh(refreshFn), context?.signal)
      } catch {
        // This caller stopped awaiting; fall through and report no credential for it.
      }
      if (isFresh()) {
        return headerFor(accessToken)
      }
    }
    // No usable credential: degrade to undefined so the transport owns the 401.
    return undefined
  }

  function setSession(tokens: TokenSet): void {
    generation += 1
    abortInflight()
    accessToken = tokens.accessToken
    expiresAt = tokens.expiresAt
    // An explicit `null` identity clears the caller; only an omitted (`undefined`) one is retained.
    identity = tokens.identity !== undefined ? tokens.identity : identity
    publish()
  }

  function logout(): void {
    generation += 1
    abortInflight()
    accessToken = undefined
    expiresAt = undefined
    identity = null
    publish()
  }

  return {
    store,
    getSnapshot: () => store.getState(),
    subscribe: (listener) => store.subscribe((state) => listener(state)),
    getAuthHeader,
    setSession,
    logout,
  }
}
