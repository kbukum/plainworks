// The BFF cookie plumbing — a request-scoped jar that reads inbound cookies and buffers the
// outbound `Set-Cookie` strings the auth flow mints. Server-bound: it carries the `server-only`
// marker so the session-cookie handling can never bundle into a client graph.

import "server-only"

import type { ServerSessionJar } from "@plainworks/auth/server"
import { parseCookieHeader } from "@plainworks/std"

/** A cookie jar over a request plus the buffered outbound `Set-Cookie` strings to apply. */
export interface RequestJar {
  /** The jar the `@plainworks/auth` session flow reads inbound cookies from and writes outbound to. */
  readonly jar: ServerSessionJar
  /** The `Set-Cookie` values the flow minted, to append to the redirect response. */
  readonly cookies: string[]
}

/**
 * Build a {@link ServerSessionJar} over a `Request`: reads inbound cookies from the `Cookie` header
 * and buffers each minted `Set-Cookie` string so the route handler can append it to the response.
 * Pure over web `Request`/`Headers` — no `next/*` — so a BFF route handler and a test share it.
 */
export function requestJar(request: Request): RequestJar {
  const inbound = parseCookieHeader(request.headers.get("cookie") ?? "")
  const cookies: string[] = []
  return {
    jar: { get: (name) => inbound.get(name), set: (cookie) => cookies.push(cookie) },
    cookies,
  }
}
