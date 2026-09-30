import { parseCookieHeader, type WebRequest } from "@plainworks/std/web"
import type { ServerSessionJar } from "../server-session"

/** A cookie jar over one request, plus the `Set-Cookie` values the auth flow minted into it. */
export interface RequestJar {
  /** The jar a {@link ServerSessionJar}-taking session method reads from and writes to. */
  readonly jar: ServerSessionJar
  /** Every `Set-Cookie` value minted so far, in order, to append to the route's response. */
  readonly cookies: readonly string[]
}

/**
 * Build a {@link RequestJar} over a Web request. Inbound cookies come from its `Cookie` header;
 * each cookie the session flow sets is buffered, so the route appends them all to its response.
 * Cookie names, values, and attributes stay owned by `createServerSession`.
 */
export function createRequestJar(request: Pick<WebRequest, "headers">): RequestJar {
  const inbound = parseCookieHeader(request.headers.get("cookie") ?? "")
  const cookies: string[] = []
  return {
    jar: {
      get: (name) => inbound.get(name),
      set: (setCookie) => {
        cookies.push(setCookie)
      },
    },
    cookies,
  }
}
