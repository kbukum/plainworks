import type { WebRequest, WebURL } from "@plainworks/std/web"
import { AuthError } from "../../errors"

/**
 * Parse a configured application origin (for example an `APP_ORIGIN` environment value) into its
 * normalized `scheme://host[:port]` form. Read the origin from deployment configuration, never from
 * a forwardable request header such as `X-Forwarded-Host`.
 *
 * @throws {AuthError} `auth/config` when `value` is not an absolute `http:` or `https:` URL.
 */
export function parseAppOrigin(value: string): string {
  const url = parseUrl(value)
  if (url === undefined || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new AuthError("auth/config", `App origin must be an absolute http(s) URL: ${value}`)
  }
  return url.origin
}

/**
 * Whether `request` was sent by a page on `origin`. Run it before any state-changing BFF route
 * (logout, a login form post) so a cross-site page cannot trigger it.
 *
 * The check follows the OWASP order. `Sec-Fetch-Site` decides when present: only `same-origin`
 * passes. Otherwise the `Origin` header must match, and otherwise the `Referer` URL's origin must
 * match. A request with none of the three is denied.
 */
export function isSameOriginRequest(request: Pick<WebRequest, "headers">, origin: string): boolean {
  const expected = parseAppOrigin(origin)
  const site = request.headers.get("sec-fetch-site")
  if (site !== null) {
    return site === "same-origin"
  }
  const sender = request.headers.get("origin")
  if (sender !== null) {
    return sender === expected
  }
  const referer = request.headers.get("referer")
  if (referer !== null) {
    return parseUrl(referer)?.origin === expected
  }
  return false
}

function parseUrl(value: string): WebURL | undefined {
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}
