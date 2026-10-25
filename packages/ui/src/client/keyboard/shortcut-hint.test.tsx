// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { formatShortcut, ShortcutHint } from "./shortcut-hint"

afterEach(cleanup)

describe("formatShortcut", () => {
  it("names each key as a key cap", () => {
    expect(formatShortcut("mod+k")).toEqual(["⌘", "K"])
    expect(formatShortcut("mod+k", { mod: "Ctrl" })).toEqual(["Ctrl", "K"])
    expect(formatShortcut("ctrl+alt+shift+escape")).toEqual(["Ctrl", "Alt", "Shift", "Esc"])
    expect(formatShortcut("[")).toEqual(["["])
  })

  it("drops Shift from a character that already needs it", () => {
    expect(formatShortcut("shift+?")).toEqual(["?"])
  })
})

describe("ShortcutHint", () => {
  it("renders one key cap per key and can be hidden from assistive tech", async () => {
    const { container } = render(<ShortcutHint combo="mod+k" mod="Ctrl" decorative />)
    const group = container.querySelector('[data-slot="kbd-group"]')
    expect(group?.getAttribute("aria-hidden")).toBe("true")
    expect([...container.querySelectorAll('[data-slot="kbd"]')].map((k) => k.textContent)).toEqual([
      "Ctrl",
      "K",
    ])
    await expectNoAxeViolations(container)
  })
})
