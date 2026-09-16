// The neutral (server) half of the theme capability: a resolver that reads the theme preference
// from the request's cookie during SSR, so the resolved value lands in the AppSnapshot and the very
// first paint is already the user's theme — no flash, no client round-trip. React-free, so it lives
// in the server-safe graph; its client provider counterpart is authored separately and joined by
// the shared capability id.

import { type App, type Capability, createApp, defineCapability } from "@plainworks/app"
import { DEFAULT_THEME, parseThemeCookie, type ThemePreference } from "@plainworks/theme"
import { THEME_CAPABILITY_ID, THEME_COOKIE } from "./constants"

/** The neutral theme capability — resolves the persisted preference from the request cookie. */
export function themeServerCapability(): Capability<ThemePreference> {
  return defineCapability<ThemePreference>({
    id: THEME_CAPABILITY_ID,
    resolve: ({ headers }) =>
      parseThemeCookie(headers.get("cookie") ?? "", THEME_COOKIE, DEFAULT_THEME),
  })
}

/**
 * Build the per-request {@link App} — the composition kernel wired with this host's neutral
 * capabilities. A pure factory with no import-time side effects and no module-level singleton, so
 * two concurrent SSR requests each get an isolated app.
 */
export function createShowcaseApp(): App {
  return createApp({ capabilities: [themeServerCapability()] })
}
