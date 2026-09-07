import { Code, ConnectError, type Interceptor } from "@connectrpc/connect"
import { isSensitiveKey } from "@plainworks/std"
import { injectedAuthHeadersKey } from "../interceptor/auth-header"

/**
 * The innermost guard against credential exfiltration. A caller interceptor sits **outside** auth in
 * the chain and can rewrite `request.url`; auth then injects the credential and Connect-Web sends the
 * rewritten URL. Bound to the transport's `baseUrl` origin, this guard runs closest to the wire and
 * refuses a send whose final URL crossed origins while carrying a credential — the same defense as
 * `@plainworks/http`'s terminal origin check. A same-origin rewrite is allowed.
 *
 * A credential is recognized two ways, because a name vocabulary alone cannot enumerate the
 * arbitrary header names the `AuthHeaderProvider` contract permits: the **tracked** names the auth
 * interceptor recorded under {@link injectedAuthHeadersKey} on this attempt, and the canonical
 * `@plainworks/std` {@link isSensitiveKey} predicate as defense in depth for a credential injected
 * by any other path.
 *
 * It is placed last so it observes the URL after every interceptor rewrite and the headers after auth
 * injection. A `ConnectError(Code.PermissionDenied)` is thrown so the failure surfaces on the single
 * Connect error contract the consumer already maps.
 */
export function originGuardInterceptor(baseUrl: string): Interceptor {
  const expectedOrigin = new URL(baseUrl).origin
  return (next) => async (request) => {
    if (new URL(request.url).origin !== expectedOrigin) {
      const injected = request.contextValues.get(injectedAuthHeadersKey)
      for (const name of injected) {
        if (request.header.has(name)) {
          throw refuse()
        }
      }
      for (const name of request.header.keys()) {
        if (isSensitiveKey(name)) {
          throw refuse()
        }
      }
    }
    return next(request)
  }
}

function refuse(): ConnectError {
  return new ConnectError(
    "Refusing to send a credential to a different origin than the transport targeted; an interceptor rewrote the URL across origins.",
    Code.PermissionDenied,
  )
}
