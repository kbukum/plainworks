"use client"

import { parseCookieHeader } from "@plainworks/std"
import { sanitizeReturnTo } from "../redirect"

/**
 * Drive a full-page navigation to a BFF auth route. Injected, not hard-wired: the browser default
 * touches `location`, but a React Native/Expo host (where `location` does not exist) passes its own
 * navigator, so the actions stay portable and testable.
 */
export type AuthNavigate = (url: string) => void

/**
 * Drive a full-page form submission (POST) to a BFF auth route. Injected, not hard-wired: the
 * browser default submits a hidden form carrying CSRF data, but an off-DOM host (e.g. React
 * Native) passes its own submit handler.
 */
export type AuthSubmit = (url: string, data?: Record<string, string>) => void

const DEFAULT_LOGIN_PATH = "/login"
const DEFAULT_LOGOUT_PATH = "/logout"
const DEFAULT_RETURN_TO_PARAM = "returnTo"
const DEFAULT_CSRF_COOKIE_NAME = "__Host-csrf"

const browserNavigate: AuthNavigate = (url) => {
  if (typeof location === "undefined") {
    throw new Error(
      "auth navigation needs a browser `location`; pass a `navigate` to run off the DOM (e.g. React Native).",
    )
  }
  location.assign(url)
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined" || typeof document.cookie !== "string") {
    return undefined
  }
  const jar = parseCookieHeader(document.cookie)
  const raw = jar.get(name)
  if (raw === undefined) {
    return undefined
  }
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

const browserSubmit: AuthSubmit = (url, data) => {
  if (typeof document === "undefined") {
    throw new Error(
      "auth submission needs a browser `document`; pass a `submit` to run off the DOM (e.g. React Native).",
    )
  }
  const form = document.createElement("form")
  form.method = "POST"
  form.action = url
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        const input = document.createElement("input")
        input.type = "hidden"
        input.name = key
        input.value = value
        form.appendChild(input)
      }
    }
  }
  document.body.appendChild(form)
  form.submit()
}

function currentPath(): string {
  if (typeof location === "undefined") {
    return "/"
  }
  return `${location.pathname}${location.search}${location.hash}`
}

/** Options for {@link login}. */
export interface LoginOptions {
  /** The BFF login route to send the browser to. Defaults to `/login`. */
  readonly loginPath?: string
  /** Where to return after login; defaults to the current location. Sanitized to same-origin. */
  readonly returnTo?: string
  /** Query parameter the return target rides back under. Defaults to `returnTo`. */
  readonly returnToParam?: string
  /** Navigation seam; defaults to a browser full-page `location.assign`. */
  readonly navigate?: AuthNavigate
}

/**
 * Begin login by navigating to the BFF login route with a sanitized, same-origin return target —
 * the browser hits the server, which starts the OIDC redirect. This touches no token; the client
 * never holds one. Off the DOM, pass `navigate`.
 */
export function login(options: LoginOptions = {}): void {
  const navigate = options.navigate ?? browserNavigate
  const loginPath = sanitizeReturnTo(options.loginPath, DEFAULT_LOGIN_PATH)
  const returnToParam = options.returnToParam ?? DEFAULT_RETURN_TO_PARAM
  const returnTo = sanitizeReturnTo(options.returnTo ?? currentPath())
  const url = new URL(loginPath, "http://localhost")
  url.searchParams.set(returnToParam, returnTo)
  navigate(`${url.pathname}${url.search}${url.hash}`)
}

/** Options for {@link logout}. */
export interface LogoutOptions {
  /** The BFF logout route to send the browser to. Defaults to `/logout`. */
  readonly logoutPath?: string
  /**
   * The session-bound CSRF token to present with the logout request. When omitted in a browser
   * environment, read from the `__Host-csrf` cookie.
   */
  readonly csrfToken?: string
  /** The cookie name to read the CSRF token from when `csrfToken` is omitted. Defaults to `__Host-csrf`. */
  readonly csrfCookieName?: string
  /** Form submission seam; defaults to creating and submitting a hidden POST form. */
  readonly submit?: AuthSubmit
}

/**
 * Log out by submitting a POST request to the BFF logout route, presenting the session-bound CSRF
 * token so cross-site navigations cannot trigger unintended logouts. Off the DOM, pass `submit`.
 */
export function logout(options: LogoutOptions = {}): void {
  const submit = options.submit ?? browserSubmit
  const target = sanitizeReturnTo(options.logoutPath, DEFAULT_LOGOUT_PATH)
  const csrfToken =
    options.csrfToken ??
    readCookie(options.csrfCookieName ?? DEFAULT_CSRF_COOKIE_NAME) ??
    readCookie("csrf") ??
    ""
  submit(target, { csrf: csrfToken })
}
