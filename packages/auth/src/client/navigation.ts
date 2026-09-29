"use client"

import { AuthError } from "../errors"
import { sanitizeReturnTo } from "../redirect"

/**
 * The host seam login and logout drive: a full-page navigation, a full-page form POST, and the two
 * reads they need from the host. `./client` stays DOM-free, so the browser implementation ships on
 * the `@plainworks/auth/form-post` adapter subpath, and a React Native/Expo host supplies its own.
 */
export interface AuthNavigator {
  /** Navigate the whole page to a same-origin BFF route. */
  navigate(url: string): void
  /** Submit a full-page POST of `fields` to a same-origin BFF route. */
  submit(url: string, fields: Readonly<Record<string, string>>): void
  /** The current location as path, search, and hash — the default return target after login. */
  currentPath(): string
  /** The session-bound CSRF token the server issued, or `undefined` when none is readable. */
  csrfToken(): string | undefined
}

const DEFAULT_LOGIN_PATH = "/login"
const DEFAULT_LOGOUT_PATH = "/logout"
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

/** Options for {@link logout}. */
export interface LogoutOptions {
  /** The host navigation seam. */
  readonly navigator: AuthNavigator
  /** The BFF logout route. Defaults to `/logout`. Sanitized to same-origin. */
  readonly logoutPath?: string
  /** The session-bound CSRF token to present. Defaults to the navigator's `csrfToken()`. */
  readonly csrfToken?: string
}

/**
 * Log out by POSTing to the BFF logout route with the session-bound CSRF token, so a cross-site
 * navigation cannot trigger an unintended logout. With no token known it still submits, and the
 * server rejects the request.
 *
 * @throws {AuthError} `auth/config` when no `navigator` is supplied.
 */
export function logout(options: LogoutOptions): void {
  const navigator = requireNavigator(options.navigator, "logout")
  const target = sanitizeReturnTo(options.logoutPath, DEFAULT_LOGOUT_PATH)
  navigator.submit(target, { csrf: options.csrfToken ?? navigator.csrfToken() ?? "" })
}
