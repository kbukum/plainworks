import { describe, expect, it } from "vitest"
import { parseThemeCookie, resolveTheme } from "./theme"

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
