"use client"

import { AuthError } from "../errors"
import { sanitizeReturnTo } from "../redirect/sanitize"

/**
 * The host seam login and logout drive: a full-page navigation and the current location. `./client`
 * stays DOM-free, so the browser implementation ships on the `@plainworks/auth/form-post` adapter
 * subpath, and a React Native/Expo host supplies its own.
 */
export interface AuthNavigator {
  /** Navigate the whole page to a same-origin BFF route. */
  navigate(url: string): void
  /** The current location as path, search, and hash — the default return target after login. */
  currentPath(): string
}

const DEFAULT_LOGIN_PATH = "/login"
const DEFAULT_RETURN_TO_PARAM = "returnTo"

function requireNavigator(navigator: AuthNavigator | undefined, action: string): AuthNavigator {
  if (navigator === undefined) {
    throw new AuthError(
      "auth/config",
      `${action} needs a \`navigator\`; pass \`formPostNavigator\` from "@plainworks/auth/form-post" in a browser, or your own AuthNavigator`,
    )
  }
  return navigator
}

/** Options for {@link login}. */
export interface LoginOptions {
  /** The host navigation seam. */
  readonly navigator: AuthNavigator
  /** The BFF login route. Defaults to `/login`. Sanitized to same-origin. */
  readonly loginPath?: string
  /** Where to return after login; defaults to the current path. Sanitized to same-origin. */
  readonly returnTo?: string
  /** Query parameter the return target rides back under. Defaults to `returnTo`. */
  readonly returnToParam?: string
}

/**
 * Begin login by navigating to the BFF login route with a sanitized, same-origin return target;
 * the server then starts the OIDC redirect. This touches no token — the client never holds one.
 *
 * @throws {AuthError} `auth/config` when no `navigator` is supplied.
 */
export function login(options: LoginOptions): void {
  const navigator = requireNavigator(options.navigator, "login")
  const loginPath = sanitizeReturnTo(options.loginPath, DEFAULT_LOGIN_PATH)
  const returnTo = sanitizeReturnTo(options.returnTo ?? navigator.currentPath())
  const url = new URL(loginPath, "http://localhost")
  url.searchParams.set(options.returnToParam ?? DEFAULT_RETURN_TO_PARAM, returnTo)
  navigator.navigate(`${url.pathname}${url.search}${url.hash}`)
}
