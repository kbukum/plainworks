import type { AuthContext, AuthHeaderProvider } from "@plainworks/std"
import type { HttpInterceptor } from "./handler"

/**
 * Inject the current credential as request headers from the shared {@link AuthHeaderProvider} seam
 * — header-only, never a token in the URL. The provider is consulted on every attempt (it sits
 * below the retry driver), so a refreshed credential is re-applied on a retry. The attempt's abort
 * signal is passed to the provider as its {@link AuthContext}, so an async token refresh is bound
 * to the same deadline/cancellation as the request — when the attempt times out or the caller
 * aborts, an abandoned refresh is cancelled instead of running on. A copy of the headers is used so
 * the base request is never mutated.
 */
export function authHeaderInterceptor(provider: AuthHeaderProvider): HttpInterceptor {
  return (next) => async (request) => {
    // exactOptionalPropertyTypes: omit `signal` entirely when the attempt carries none, rather than
    // passing `{ signal: undefined }`.
    const context: AuthContext = request.signal === undefined ? {} : { signal: request.signal }
    const auth = await provider(context)
    if (auth === undefined) {
      return next(request)
    }
    const headers = new Headers(request.headers)
    for (const [name, value] of Object.entries(auth)) {
      headers.set(name, value)
    }
    return next({ ...request, headers })
  }
}
