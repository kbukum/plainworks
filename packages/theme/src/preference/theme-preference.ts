import { readCookie } from "@plainworks/std/web"

export const COLOR_SCHEMES = [
  "neutral",
  "indigo",
  "violet",
  "blue",
  "emerald",
  "orange",
  "slate",
  "rose",
  "cyan",
] as const

export type ColorScheme = (typeof COLOR_SCHEMES)[number]
export type ThemeMode = "light" | "dark" | "system"

export interface ThemePreference {
  readonly mode: ThemeMode
  readonly colorScheme: ColorScheme
}

export interface ResolvedTheme {
  /** The class list for `<html>`: the explicit mode class, if any, and the color scheme class. */
  readonly htmlClass: string
}

export const DEFAULT_THEME: ThemePreference = {
  mode: "system",
  colorScheme: "indigo",
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system"
}

function isColorScheme(value: unknown): value is ColorScheme {
  return typeof value === "string" && COLOR_SCHEMES.some((scheme) => scheme === value)
}

/**
 * Narrow an untrusted value — a cookie payload, a serialized app snapshot — to a valid
 * {@link ThemePreference}. The package owning the vocabulary owns the guard, so a mode or color
 * scheme added here is accepted everywhere at once.
 */
export function isThemePreference(value: unknown): value is ThemePreference {
  if (typeof value !== "object" || value === null) {
    return false
  }
  const candidate: { readonly mode?: unknown; readonly colorScheme?: unknown } = value
  return isThemeMode(candidate.mode) && isColorScheme(candidate.colorScheme)
}

/** Coerce an untrusted value to a {@link ThemePreference}, falling back when it is not one. */
export function themePreferenceOf(
  value: unknown,
  fallback: ThemePreference = DEFAULT_THEME,
): ThemePreference {
  return isThemePreference(value) ? value : fallback
}

/** Parse an untrusted client-readable cookie value into a valid theme preference. */
export function parseThemeCookie(
  cookieHeader: string,
  cookieName = "theme",
  fallback: ThemePreference = DEFAULT_THEME,
): ThemePreference {
  const raw = readCookie(cookieHeader, cookieName)
  if (raw === undefined) {
    return fallback
  }

  try {
    const value: unknown = JSON.parse(decodeURIComponent(raw))
    return themePreferenceOf(value, fallback)
  } catch {
    return fallback
  }
}

/**
 * Resolve the `<html>` class a host applies before hydration. An explicit mode adds its `light` or
 * `dark` class. System mode adds none: the stylesheet follows `prefers-color-scheme` itself, so a
 * server that cannot see the OS preference still paints the right mode, with no inline script.
 */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  const modeClass = preference.mode === "system" ? "" : `${preference.mode} `
  return { htmlClass: `${modeClass}theme-${preference.colorScheme}` }
}
