import type { WebResponse, WebURL } from "@plainworks/std/web"
import { AuthError } from "../../errors"
import { sanitizeReturnTo } from "../../redirect"
import { parseAppOrigin } from "./origin"

/** Options for {@link redirectToPath}. */
export interface RedirectToPathOptions {
  /** The app's configured origin; the redirect never leaves it. */
  readonly origin: string
  /** The target path. Anything that is not a same-origin path falls back to `fallback`. */
  readonly path: string | undefined
  /** Where to go when `path` is unsafe. Defaults to `/`. */
  readonly fallback?: string
  /** The `Set-Cookie` values to carry, usually a {@link RequestJar}'s `cookies`. */
  readonly cookies?: readonly string[]
}

/**
 * Answer with a `303 See Other` to a path on the app's own origin, carrying every cookie. The path
 * is sanitized first, so a caller-supplied `returnTo` can never become an open redirect. `303`
 * makes the browser follow with a GET, which is right after both a login bounce and a logout POST.
 *
 * @throws {AuthError} `auth/config` when `origin` is not an absolute http(s) origin.
 */
export function redirectToPath(options: RedirectToPathOptions): WebResponse {
  const origin = parseAppOrigin(options.origin)
  const path = sanitizeReturnTo(options.path, sanitizeReturnTo(options.fallback))
  return seeOther(new URL(path, origin).href, options.cookies)
}

/**
 * Answer with a `303 See Other` to a trusted absolute URL, carrying every cookie. Use it for a URL
 * the auth flow produced, such as the provider's authorization URL, never for caller input.
 *
 * @throws {AuthError} `auth/config` when `url` is not an absolute http(s) URL.
 */
export function redirectToUrl(url: string, cookies: readonly string[] = []): WebResponse {
  let target: WebURL
  try {
    target = new URL(url)
  } catch (cause) {
    throw new AuthError("auth/config", "Redirect URL must be an absolute http(s) URL", { cause })
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new AuthError("auth/config", "Redirect URL must be an absolute http(s) URL")
  }
  return seeOther(target.href, cookies)
}

function seeOther(location: string, cookies: readonly string[] = []): WebResponse {
  const headers = new Headers({ location })
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie)
  }
  return new Response(null, { status: 303, headers })
}
