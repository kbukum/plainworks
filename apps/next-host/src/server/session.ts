import "server-only"

// The server-only request resolution for the running host: it reads the App Router request cookies
// through `next/headers`, resolves the per-request AppSnapshot (theme + session) through the
// composition kernel for hydration, and gates the protected routes. It carries the `server-only`
// marker and reaches for `hostAuth` (the token-custody wiring), so it can never enter a
// `"use client"` graph — the session read stays entirely on the server, and only an identity slice
// (never a token) crosses to the client via the snapshot.

import { type AppSnapshot, createApp } from "@plainworks/app"
import { createAuthResolver } from "@plainworks/app/capabilities/auth"
import { createThemeResolver } from "@plainworks/app/capabilities/theme"
import { unauthenticatedRedirect } from "@plainworks/auth/redirect"
import type { AuthSnapshot } from "@plainworks/auth/session"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { LOGIN_PATH, THEME_COOKIE } from "../neutral/constants"
import { hostAuth } from "./identity-provider"
import { appOrigin } from "./origin"

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

/** The per-request document state the root layout renders from. */
export interface ResolvedDocument {
  /** The snapshot the client `AppProvider` hydrates from. */
  readonly snapshot: AppSnapshot
  /** The `<html>` class for the persisted theme. */
  readonly htmlClass: string
}

/**
 * Resolve the per-request snapshot (theme plus session) and the `<html>` class through the
 * `@plainworks/app` recipes, the same resolvers the showcase uses. A fresh app per call: no
 * module-level singleton, SSR-safe.
 */
export async function resolveDocument(): Promise<ResolvedDocument> {
  const { auth } = await hostAuth()
  const app = createApp({
    capabilities: [
      createThemeResolver({ cookie: THEME_COOKIE }),
      createAuthResolver({ read: auth.read }),
    ],
  })
  const cookieHeader = await requestCookieHeader()
  const snapshot = await app.resolve({ headers: new Headers({ cookie: cookieHeader }) })
  return { snapshot, htmlClass: app.htmlClass(snapshot) }
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
