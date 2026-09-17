import "server-only"

// The server-only request resolution for the running host: it reads the App Router request cookies
// through `next/headers`, resolves the per-request AppSnapshot (theme + session) through the
// composition kernel for hydration, and gates the protected routes. It carries the `server-only`
// marker and reaches for `hostAuth` (the token-custody wiring), so it can never enter a
// `"use client"` graph — the session read stays entirely on the server, and only an identity slice
// (never a token) crosses to the client via the snapshot.

import { type AppSnapshot, createApp, defineCapability } from "@plainworks/app"
import { type AuthSnapshot, unauthenticatedRedirect } from "@plainworks/auth"
import { DEFAULT_THEME, parseThemeCookie, type ThemePreference } from "@plainworks/theme"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { LOGIN_PATH, THEME_CAPABILITY_ID, THEME_COOKIE } from "../neutral/constants"
import { authServerCapability } from "./auth"
import { hostAuth } from "./identity-provider"
import { appOrigin } from "./origin"

/** The neutral theme capability — resolves the persisted preference from the request cookie. */
function themeServerCapability() {
  return defineCapability<ThemePreference>({
    id: THEME_CAPABILITY_ID,
    resolve: ({ headers }) =>
      parseThemeCookie(headers.get("cookie") ?? "", THEME_COOKIE, DEFAULT_THEME),
  })
}

/** Reassemble the request `Cookie` header from the App Router cookie store. */
async function requestCookieHeader(): Promise<string> {
  const store = await cookies()
  return store
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ")
}

/**
 * The absolute origin the request reads `/api/*` against — the host's own configured origin, not a
 * value derived from a forwardable request header. The RSC task prefetch and the browser query both
 * read against it, so the mock backend is reached with one trusted origin whether the request is
 * server- or client-driven.
 */
export function requestOrigin(): string {
  return appOrigin()
}

/**
 * Resolve the per-request {@link AppSnapshot} — theme plus session — through the composition
 * kernel, the same neutral capabilities the showcase resolves, so the client `AppProvider` hydrates
 * from the same serialized values. A fresh app per call: no module-level singleton, SSR-safe.
 */
export async function resolveSnapshot(): Promise<AppSnapshot> {
  const { auth } = await hostAuth()
  const app = createApp({
    capabilities: [themeServerCapability(), authServerCapability(auth.read)],
  })
  const cookieHeader = await requestCookieHeader()
  return app.resolve({ headers: new Headers({ cookie: cookieHeader }) })
}

/** Resolve the client-safe auth slice from the request cookies. */
export async function readAuth(): Promise<AuthSnapshot> {
  const { auth } = await hostAuth()
  return auth.read(await requestCookieHeader())
}

/**
 * Session gate for a protected route: an unauthenticated request is bounced to the login route with
 * a sanitized return target rather than rendered. `redirect` throws to interrupt the RSC render.
 */
export async function requireSession(returnTo: string): Promise<void> {
  const auth = await readAuth()
  if (!auth.authenticated) {
    redirect(unauthenticatedRedirect({ loginPath: LOGIN_PATH }, returnTo).to)
  }
}
