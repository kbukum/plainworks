// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  CommandPalette,
  type CommandPaletteGroup,
  type CommandPaletteProps,
} from "./command-palette"

// cmdk measures and scrolls its list; jsdom implements neither.
class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = TestResizeObserver
Element.prototype.scrollIntoView = vi.fn()

afterEach(cleanup)

function groups(onSelect: (id: string) => void): readonly CommandPaletteGroup[] {
  return [
    {
      id: "go",
      heading: "Go to",
      items: [
        { id: "overview", label: "Overview", onSelect: () => onSelect("overview") },
        {
          id: "settings",
          label: "Settings",
          keywords: ["preferences"],
          onSelect: () => onSelect("settings"),
        },
      ],
    },
    {
      id: "actions",
      heading: "Actions",
      items: [
        {
          id: "theme",
          label: "Switch to dark mode",
          shortcut: "Theme",
          onSelect: () => onSelect("theme"),
        },
      ],
    },
  ]
}

function renderPalette(props: Partial<CommandPaletteProps> = {}) {
  const selected: string[] = []
  render(
    <main>
      <CommandPalette groups={groups((id) => selected.push(id))} {...props} />
    </main>,
  )
  return { selected }
}

async function openWithHotkey(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.keyboard("{Control>}k{/Control}")
  return screen.findByRole("combobox", { name: "Command menu" })
}

describe("CommandPalette", () => {
  it("opens from its trigger and lists every item by group", async () => {
    const user = userEvent.setup()
    renderPalette()
    await user.click(screen.getByRole("button", { name: "Search commands" }))
    expect(await screen.findByRole("combobox", { name: "Command menu" })).toBeDefined()
    expect(screen.getByRole("group", { name: "Go to" })).toBeDefined()
    expect(screen.getByRole("option", { name: "Overview" })).toBeDefined()
    expect(screen.getByRole("option", { name: /Switch to dark mode/ })).toBeDefined()
  })

  it("toggles on mod+K and closes on Escape, returning focus", async () => {
    const user = userEvent.setup()
    renderPalette()
    await openWithHotkey(user)
    await user.keyboard("{Meta>}k{/Meta}")
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull())

    await openWithHotkey(user)
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull())
  })

  it("filters by label and keywords, and says when nothing matches", async () => {
    const user = userEvent.setup()
    renderPalette()
    const input = await openWithHotkey(user)
    await user.type(input, "preferences")
    expect(screen.getByRole("option", { name: "Settings" })).toBeDefined()
    expect(screen.queryByRole("option", { name: "Overview" })).toBeNull()

    await user.clear(input)
    await user.type(input, "zzz")
    expect(screen.getByText("No matching commands.")).toBeDefined()
    expect(screen.queryByRole("option")).toBeNull()
  })

  it("runs the chosen item from the keyboard and closes first", async () => {
    const user = userEvent.setup()
    const { selected } = renderPalette()
    const input = await openWithHotkey(user)
    await user.type(input, "sett")
    await user.keyboard("{Enter}")
    expect(selected).toEqual(["settings"])
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull())
  })

  it("can turn the hotkey off and take injected labels", async () => {
    const user = userEvent.setup()
    renderPalette({ hotkey: false, labels: { trigger: "Suchen", title: "Befehle" } })
    await user.keyboard("{Control>}k{/Control}")
    expect(screen.queryByRole("combobox")).toBeNull()
    await user.click(screen.getByRole("button", { name: "Suchen" }))
    expect(await screen.findByRole("combobox", { name: "Befehle" })).toBeDefined()
  })

  it("widens its trigger by the shell's width, not the viewport", () => {
    renderPalette()
    const trigger = screen.getByRole("button", { name: "Search commands" })
    expect(trigger.className).toContain("@2xl/shell:w-56")
  })

  it("has no accessibility violations closed or open", async () => {
    const user = userEvent.setup()
    renderPalette()
    await expectNoAxeViolations(document.body)
    await openWithHotkey(user)
    await expectNoAxeViolations(document.body)
  })
})
