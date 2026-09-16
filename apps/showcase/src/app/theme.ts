// The neutral theme-narrowing helper shared by the server render and the client provider. The app
// snapshot is a trust boundary — a capability's resolved slice arrives typed `unknown` — so both
// halves narrow it here through one guard instead of trusting a cast, and the server resolves the
// `<html>` class from the same validated value the client seeds `ThemeProvider` with. React-free
// and host-agnostic, so it stays in the server-safe graph.

import { COLOR_SCHEMES, DEFAULT_THEME, resolveTheme, type ThemePreference } from "@plainworks/theme"

/** Narrow an untrusted snapshot slice to a valid {@link ThemePreference}. */
export function isThemePreference(value: unknown): value is ThemePreference {
  if (typeof value !== "object" || value === null) {
    return false
  }
  const candidate = value as { mode?: unknown; colorScheme?: unknown }
  const modeOk =
    candidate.mode === "light" || candidate.mode === "dark" || candidate.mode === "system"
  return modeOk && COLOR_SCHEMES.some((scheme) => scheme === candidate.colorScheme)
}

/** Coerce an untrusted snapshot slice to a preference, falling back to the default. */
export function themePreferenceOf(resolved: unknown): ThemePreference {
  return isThemePreference(resolved) ? resolved : DEFAULT_THEME
}

/**
 * Resolve the `<html>` class for a snapshot slice. The server has no `prefers-color-scheme` signal,
 * so a `"system"` preference resolves to light for the first paint; the client provider re-resolves
 * against the real media query after hydration, and light-first is the standard no-JS default.
 */
export function resolveHtmlClass(resolved: unknown): string {
  return resolveTheme(themePreferenceOf(resolved), false).htmlClass
}
