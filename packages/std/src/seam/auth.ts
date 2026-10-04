import type { WebAbortSignal } from "../web"

/**
 * Auth header map. Header-only by contract — credentials travel in HTTP headers, NEVER in a URL or
 * query string.
 */
export type AuthHeaders = Record<string, string>

/**
 * Per-attempt context handed to an {@link AuthHeaderProvider}. Carries the attempt's `signal` so a
 * provider can bind asynchronous header acquisition to the same deadline/cancellation as the
 * request. An asynchronous provider MUST honor `signal` (pass it to its own `fetch`/awaits, or
 * check `signal.throwIfAborted()`); a static provider may ignore it.
 */
export interface AuthContext {
  /** The attempt's cancellation signal. */
  readonly signal?: WebAbortSignal
}

/**
 * The shared auth-header seam: the single source of truth every transport and the auth package
 * satisfy structurally, so none of them import one another or read storage directly.
 *
 * An implementation resolves the current credential as headers to attach to each (re)connection or
 * request, or `undefined` when unauthenticated. An asynchronous implementation receives an
 * {@link AuthContext} and honors its `signal`; this seam does not authorize a refresh protocol.
 */
export type AuthHeaderProvider = (
  context?: AuthContext,
) => AuthHeaders | undefined | Promise<AuthHeaders | undefined>

/** A protected operation borrows a session lifetime and always releases its lease. */
export interface ProtectedSessionLease {
  readonly signal: WebAbortSignal
  readonly headers: AuthHeaders
  release(): void
}

/** Defined below transports; authentication implements it at composition time. */
export interface ProtectedSession {
  acquire(context?: AuthContext): Promise<ProtectedSessionLease>
  /** One bounded authoritative check before a protected stream reconnects. */
  revalidate(context?: AuthContext): Promise<void>
  /** Terminal/operational authentication outcomes fail closed for every borrowed operation. */
  invalidate(cause: unknown): void
}
