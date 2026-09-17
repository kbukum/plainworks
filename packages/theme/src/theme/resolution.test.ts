import { describe, expect, it } from "vitest"
import {
  DEFAULT_THEME,
  isThemePreference,
  parseThemeCookie,
  resolveTheme,
  themePreferenceOf,
} from "./resolution"

describe("resolveTheme", () => {
  it("resolves an explicit dark theme before hydration", () => {
    expect(resolveTheme({ mode: "dark", colorScheme: "indigo" }, false)).toEqual({
      htmlClass: "dark theme-indigo",
      colorScheme: "dark",
    })
  })

  it("resolves system mode from the server-provided preference", () => {
    expect(resolveTheme({ mode: "system", colorScheme: "neutral" }, true)).toEqual({
      htmlClass: "dark theme-neutral",
      colorScheme: "dark",
    })
  })
})

describe("parseThemeCookie", () => {
  it("reads and validates an encoded theme cookie", () => {
    const value = encodeURIComponent(JSON.stringify({ mode: "light", colorScheme: "blue" }))

    expect(parseThemeCookie(`session=ignored; theme=${value}`, "theme")).toEqual({
      mode: "light",
      colorScheme: "blue",
    })
  })

  it("falls back for malformed or unsupported values", () => {
    expect(parseThemeCookie("theme=%7Bbroken", "theme")).toEqual({
      mode: "system",
      colorScheme: "indigo",
    })
    expect(
      parseThemeCookie(
        `theme=${encodeURIComponent(JSON.stringify({ mode: "sepia", colorScheme: "blue" }))}`,
        "theme",
      ),
    ).toEqual({ mode: "system", colorScheme: "indigo" })
  })
})

describe("isThemePreference", () => {
  it("accepts a well-formed preference", () => {
    expect(isThemePreference({ mode: "dark", colorScheme: "violet" })).toBe(true)
  })

  it("rejects an unknown mode, unknown scheme, or non-object", () => {
    expect(isThemePreference({ mode: "neon", colorScheme: "violet" })).toBe(false)
    expect(isThemePreference({ mode: "dark", colorScheme: "not-a-scheme" })).toBe(false)
    expect(isThemePreference(null)).toBe(false)
    expect(isThemePreference("dark")).toBe(false)
  })
})

describe("themePreferenceOf", () => {
  it("returns a valid preference unchanged", () => {
    const preference = { mode: "light", colorScheme: "rose" } as const
    expect(themePreferenceOf(preference)).toEqual(preference)
  })

  it("falls back to the default, or to an explicit fallback, for an untrusted value", () => {
    expect(themePreferenceOf(undefined)).toEqual(DEFAULT_THEME)
    expect(themePreferenceOf({ mode: "neon" }, { mode: "dark", colorScheme: "cyan" })).toEqual({
      mode: "dark",
      colorScheme: "cyan",
    })
  })
})
