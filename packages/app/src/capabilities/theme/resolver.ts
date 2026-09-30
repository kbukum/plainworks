import {
  DEFAULT_THEME,
  parseThemeCookie,
  resolveTheme,
  type ThemePreference,
  themePreferenceOf,
} from "@plainworks/theme/preference"
import { type Capability, defineCapability } from "../../kernel/capability"

/** The default id of the theme capability: its snapshot key and its providers' join key. */
export const THEME_CAPABILITY_ID = "theme"

/** Options for {@link createThemeResolver}. */
export interface ThemeResolverOptions {
  /** The cookie the client's theme source writes (for example `cookieScope` with this key). */
  readonly cookie: string
  /** The theme used when the cookie is absent or invalid; defaults to `DEFAULT_THEME`. */
  readonly fallback?: ThemePreference
  /** The capability id; defaults to {@link THEME_CAPABILITY_ID}. */
  readonly id?: string
}

/**
 * The server half of the theme recipe. It reads the user's theme from the request cookie, and its
 * `htmlClass` gives the mode and color-scheme classes for `<html>`, so the first paint already has
 * the right theme with no inline script. System mode adds no mode class: the stylesheet follows
 * the OS through `prefers-color-scheme`. Pair it with `createThemeCapability` on the client.
 */
export function createThemeResolver(options: ThemeResolverOptions): Capability<ThemePreference> {
  const { cookie, fallback = DEFAULT_THEME, id = THEME_CAPABILITY_ID } = options
  return defineCapability<ThemePreference>({
    id,
    resolve: ({ headers }) => parseThemeCookie(headers.get("cookie") ?? "", cookie, fallback),
    htmlClass: (theme) => resolveTheme(themePreferenceOf(theme, fallback)).htmlClass,
  })
}
