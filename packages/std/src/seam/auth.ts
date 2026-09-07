import type { WebAbortSignal } from "../web"

/**
 * Auth header map. Header-only by contract — credentials travel in HTTP headers, NEVER in a URL or query string.
 */
export type AuthHeaders = Record<string, string>

/**
 * Per-attempt context handed to an {@link AuthHeaderProvider}. Carries the attempt's `signal` so a provider that performs an async token refresh can bind the refresh to the same deadline/cancellation as the request: when the attempt times out or the caller aborts, the abandoned refresh is cancelled instead of running on after the request has moved on. A provider that refreshes MUST honor `signal` (pass it to its own `fetch`/awaits, or check `signal.throwIfAborted()`); a static provider may ignore it.
 */
export interface AuthContext {
  /** The attempt's cancellation signal — abort an in-flight refresh when it fires. */
  readonly signal?: WebAbortSignal
}

/**
 * The shared auth-header seam: the single source of truth every transport and the auth package satisfy structurally, so none of them import one another or read storage directly.
 *
 * An implementation resolves the current credential as headers to attach to each (re)connection or request, or `undefined` when unauthenticated. It may be async (e.g. to refresh a token first); an async refresh receives an {@link AuthContext} and must honor its `signal` so a refresh never outlives the attempt that triggered it.
 */
export type AuthHeaderProvider = (
  context?: AuthContext,
) => AuthHeaders | undefined | Promise<AuthHeaders | undefined>
