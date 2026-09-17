import { describe, expect, it } from "vitest"
import { resolveHtmlClass } from "./theme"

// The snapshot slice is a trust boundary — it round-trips through serialization — so the server
// layout and the client provider coerce it through `@plainworks/theme`'s own guard rather than a
// cast, and the server resolves the first-paint `<html>` class from that same validated value.

describe("resolveHtmlClass", () => {
  it("resolves the color scheme and dark mode into the html class", () => {
    expect(resolveHtmlClass({ mode: "dark", colorScheme: "violet" })).toContain("dark")
    expect(resolveHtmlClass({ mode: "dark", colorScheme: "violet" })).toContain("theme-violet")
  })

  it("resolves a system preference to light server-side (no media signal)", () => {
    expect(resolveHtmlClass({ mode: "system", colorScheme: "indigo" })).not.toContain("dark")
  })

  it("falls back to the default theme for an untrusted slice", () => {
    expect(resolveHtmlClass("not-a-preference")).toBe("theme-indigo")
  })
})
