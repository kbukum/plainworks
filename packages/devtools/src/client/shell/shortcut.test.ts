import { afterEach, describe, expect, it, vi } from "vitest"
import { isApplePlatform, shortcutAriaKeys, shortcutHint } from "./shortcut"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("shortcut presentation", () => {
  it("names the platform's modifier keys in the visible hint", () => {
    expect(shortcutHint("mod+shift+d", true)).toBe("⌘⇧D")
    expect(shortcutHint("mod+shift+d", false)).toBe("Ctrl+Shift+D")
    expect(shortcutHint("alt+ctrl+k", true)).toBe("⌥⌃K")
    expect(shortcutHint("option+control+k", false)).toBe("Alt+Ctrl+K")
  })

  it("lists both bindings of `mod` for assistive technology, the platform's first", () => {
    expect(shortcutAriaKeys("mod+shift+d", true)).toBe("Meta+Shift+D Control+Shift+D")
    expect(shortcutAriaKeys("mod+shift+d", false)).toBe("Control+Shift+D Meta+Shift+D")
  })

  it("keeps an explicit modifier as written", () => {
    expect(shortcutAriaKeys("ctrl+alt+i", true)).toBe("Control+Alt+I")
    expect(shortcutAriaKeys("meta+i", false)).toBe("Meta+I")
  })

  it("reads every modifier alias the shortcut binding accepts", () => {
    for (const meta of ["cmd", "command"]) {
      expect(shortcutHint(`${meta}+k`, true)).toBe("⌘K")
      expect(shortcutHint(`${meta}+k`, false)).toBe("Meta+K")
      expect(shortcutAriaKeys(`${meta}+k`, false)).toBe("Meta+K")
    }
  })

  it("detects Apple platforms from client hints, falling back to the user agent", () => {
    vi.stubGlobal("navigator", { userAgentData: { platform: "macOS" }, userAgent: "" })
    expect(isApplePlatform()).toBe(true)
    vi.stubGlobal("navigator", { userAgentData: { platform: "Windows" }, userAgent: "Macintosh" })
    expect(isApplePlatform()).toBe(false)
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)" })
    expect(isApplePlatform()).toBe(true)
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (X11; Linux x86_64)" })
    expect(isApplePlatform()).toBe(false)
  })

  it("treats a runtime without a navigator as non-Apple", () => {
    vi.stubGlobal("navigator", undefined)
    expect(isApplePlatform()).toBe(false)
  })
})
