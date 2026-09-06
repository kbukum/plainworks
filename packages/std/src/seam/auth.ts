/**
 * Auth header map. Header-only by contract — credentials travel in HTTP headers, NEVER in a URL or query string.
 */
export type AuthHeaders = Record<string, string>

/**
 * The shared auth-header seam: the single source of truth every transport and the auth package satisfy structurally, so none of them import one another or read storage directly.
 *
 * An implementation resolves the current credential as headers to attach to each (re)connection or request, or `undefined` when unauthenticated. It may be async (e.g. to refresh a token first).
 */
export type AuthHeaderProvider = () => AuthHeaders | undefined | Promise<AuthHeaders | undefined>
