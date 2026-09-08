import { type ContextKey, createContextKey, type Interceptor } from "@connectrpc/connect"
import type { AuthContext, AuthHeaderProvider } from "@plainworks/std"

/**
 * Context key carrying the header names the auth interceptor injected on this attempt. The
 * innermost origin guard reads it to recognize a credential by **fact of injection** — the
 * `AuthHeaderProvider` contract permits arbitrary header names (`x-proof`, a tenant API key), so a
 * name vocabulary alone can never enumerate them.
 */
export const injectedAuthHeadersKey: ContextKey<readonly string[]> = createContextKey<
  readonly string[]
>([])

/**
 * Inject the current credential as request headers from the shared `@plainworks/std`
 * {@link AuthHeaderProvider} seam — header-only, never a token in the URL. This is the same seam
 * `@plainworks/auth`, `http`, and `channel` satisfy, so none of them import one another.
 *
 * The provider is consulted **per attempt** (this interceptor sits inside the retry driver), so a
 * refreshed credential is re-applied on a retry. The attempt's abort signal is handed to the
 * provider as its {@link AuthContext}, binding an async token refresh to the same
 * deadline/cancellation as the request: when the attempt times out or the caller aborts, an
 * abandoned refresh is cancelled rather than left running.
 *
 * Injection is **non-mutating**: a fresh `Headers` copy carries the credential, so the base request
 * the retry driver reuses across attempts is never mutated. A credential injected on one attempt
 * therefore never lingers onto the next — matching the `@plainworks/http` auth interceptor — so
 * when the provider later returns `undefined` the header is genuinely absent.
 */
export function authHeaderInterceptor(provider: AuthHeaderProvider): Interceptor {
  return (next) => async (request) => {
    // exactOptionalPropertyTypes: omit `signal` entirely when the attempt carries none.
    const context: AuthContext = request.signal === undefined ? {} : { signal: request.signal }
    const auth = await provider(context)
    if (auth === undefined) {
      return next(request)
    }
    const header = new Headers(request.header)
    for (const [name, value] of Object.entries(auth)) {
      header.set(name, value)
    }
    return next({
      ...request,
      header,
      contextValues: request.contextValues.set(injectedAuthHeadersKey, Object.keys(auth)),
    })
  }
}
