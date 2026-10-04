import { parseCookieHeader, type WebRequest } from "@plainworks/std/web"
import { AuthError } from "../../errors"
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
  const header = request.headers.get("cookie") ?? ""
  const presented = header
    .split(";")
    .filter((part) => part.slice(0, part.indexOf("=")).trim() === "__Host-session")
  if (
    presented.length > 1 ||
    request.headers.has("authorization") ||
    request.headers.has("x-api-key")
  ) {
    throw new AuthError("auth/session-invalid", "ambiguous or unsupported browser credentials")
  }
  const inbound = parseCookieHeader(header)
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
