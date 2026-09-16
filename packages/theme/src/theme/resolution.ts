import { parseCookieHeader } from "@plainworks/std"

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
  readonly htmlClass: string
  readonly colorScheme: "light" | "dark"
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

function isThemePreference(value: unknown): value is ThemePreference {
  if (typeof value !== "object" || value === null) {
    return false
  }
  const candidate: { readonly mode?: unknown; readonly colorScheme?: unknown } = value
  return isThemeMode(candidate.mode) && isColorScheme(candidate.colorScheme)
}

/** Parse an untrusted client-readable cookie value into a valid theme preference. */
export function parseThemeCookie(
  cookieHeader: string,
  cookieName = "theme",
  fallback: ThemePreference = DEFAULT_THEME,
): ThemePreference {
  const raw = parseCookieHeader(cookieHeader).get(cookieName)
  if (raw === undefined) {
    return fallback
  }

  try {
    const value: unknown = JSON.parse(decodeURIComponent(raw))
    return isThemePreference(value) ? value : fallback
  } catch {
    return fallback
  }
}

/** Resolve the exact attributes a host applies to `<html>` before hydration. */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  const colorScheme =
    preference.mode === "system" ? (systemPrefersDark ? "dark" : "light") : preference.mode
  return {
    htmlClass: `${colorScheme === "dark" ? "dark " : ""}theme-${preference.colorScheme}`,
    colorScheme,
  }
}
