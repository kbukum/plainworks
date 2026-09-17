// The neutral first-paint theme policy shared by the server layout and the client provider. The app
// snapshot is a trust boundary — a capability's resolved slice arrives typed `unknown` — so the
// untrusted slice is coerced through `@plainworks/theme`'s own guard rather than a host-local copy,
// and the server resolves the `<html>` class from the same validated value the client seeds
// `ThemeProvider` with. React-free and host-agnostic, so it stays in the server-safe graph.

import { resolveTheme, themePreferenceOf } from "@plainworks/theme"

/**
 * Resolve the `<html>` class for a snapshot slice. The server has no `prefers-color-scheme` signal,
 * so a `"system"` preference resolves to light for the first paint; the client provider re-resolves
 * against the real media query after hydration, and light-first is the standard no-JS default.
 */
export function resolveHtmlClass(resolved: unknown): string {
  return resolveTheme(themePreferenceOf(resolved), false).htmlClass
}
