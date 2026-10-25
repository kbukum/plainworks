// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ShortcutsSheet } from "./shortcuts-sheet"

afterEach(cleanup)

const GROUPS = [
  {
    title: "Anywhere",
    shortcuts: [
      { combo: "mod+k", description: "Search and go" },
      { combo: "shift+?", description: "Show shortcuts" },
      { combo: "[", description: "Collapse the sidebar" },
    ],
  },
]

describe("ShortcutsSheet", () => {
  it("lists every shortcut with its keys", async () => {
    render(
      <ShortcutsSheet
        open
        onOpenChange={() => undefined}
        groups={GROUPS}
        singleKeys
        onSingleKeysChange={() => undefined}
      />,
    )
    const dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" })
    expect(screen.getByRole("heading", { name: "Anywhere" })).toBeDefined()
    expect(dialog.textContent).toContain("Search and go")
    expect(dialog.textContent).toContain("⌘K")
    await expectNoAxeViolations(dialog)
  })

  it("turns character-key shortcuts off and on", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ShortcutsSheet
        open
        onOpenChange={() => undefined}
        groups={GROUPS}
        singleKeys
        onSingleKeysChange={onChange}
      />,
    )
    const toggle = await screen.findByRole("switch", { name: "Character-key shortcuts" })
    expect(toggle.getAttribute("aria-checked")).toBe("true")
    await user.click(toggle)
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it("marks character-key shortcuts as off while they are off", async () => {
    render(
      <ShortcutsSheet
        open
        onOpenChange={() => undefined}
        groups={GROUPS}
        singleKeys={false}
        onSingleKeysChange={() => undefined}
      />,
    )
    const dialog = await screen.findByRole("dialog")
    const rows = [...dialog.querySelectorAll('[data-slot="shortcut-row"]')]
    expect(rows.map((row) => row.getAttribute("data-off"))).toEqual(["false", "true", "true"])
  })
})
