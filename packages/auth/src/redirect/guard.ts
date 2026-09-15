import type { RedirectSignal } from "@plainworks/std"
import type { SessionSnapshot } from "../session"
import { sanitizeReturnTo } from "./sanitize"

/** How an unauthenticated caller is sent to sign in. */
export interface AuthGuardConfig {
  /** The path-absolute login route (e.g. `/login`); sanitized like any target. */
  readonly loginPath: string
  /** Query parameter the sanitized origin path is passed back under. Defaults to `returnTo`. */
  readonly returnToParam?: string
}

const DEFAULT_RETURN_TO_PARAM = "returnTo"

/**
 * Build the {@link RedirectSignal} that sends an unauthenticated caller to the login route,
 * preserving where they were headed as a **sanitized, same-origin** `returnTo` query parameter (the
 * open-redirect guard runs on both `loginPath` and `currentPath`). Host-neutral: it produces the
 * signal seam value only — a router adapter translates it into an actual navigation — so the guard
 * logic stays testable and router-free.
 */
export function unauthenticatedRedirect(
  config: AuthGuardConfig,
  currentPath?: string,
): RedirectSignal {
  const loginPath = sanitizeReturnTo(config.loginPath, "/login")
  const returnTo = sanitizeReturnTo(currentPath, "/")
  const param = config.returnToParam ?? DEFAULT_RETURN_TO_PARAM
  const url = new URL(loginPath, "http://localhost")
  url.searchParams.set(param, returnTo)
  const to = `${url.pathname}${url.search}${url.hash}`
  return { to, reason: "unauthenticated" }
}

/**
 * A route guard over a {@link SessionSnapshot}: returns `null` when the caller is authenticated
 * (let the route render), or an {@link unauthenticatedRedirect} signal when they are not.
 * The one place a consumer wires the redirect contract into an actual route.
 */
export function guardSession(
  config: AuthGuardConfig,
  snapshot: SessionSnapshot,
  currentPath?: string,
): RedirectSignal | null {
  if (snapshot.status === "authenticated") {
    return null
  }
  return unauthenticatedRedirect(config, currentPath)
}
