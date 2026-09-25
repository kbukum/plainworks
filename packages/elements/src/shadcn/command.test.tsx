// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shadcn/command"

class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = TestResizeObserver
Element.prototype.scrollIntoView = vi.fn()

afterEach(cleanup)

function Example({ onSelect = () => undefined }: { onSelect?: (value: string) => void }) {
  return (
    <main>
      <Command label="Command menu">
        <CommandInput aria-label="Search commands" placeholder="Search commands" />
        <CommandList>
          <CommandEmpty>No commands found.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem value="open-file" onSelect={onSelect}>
              Open file
            </CommandItem>
            <CommandItem value="close-tab">Close tab</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </main>
  )
}

describe("Command", () => {
  it("renders a named combobox with a listbox of options", () => {
    render(<Example />)
    expect(screen.getByRole("combobox", { name: "Command menu" })).toBeTruthy()
    expect(screen.getByRole("listbox")).toBeTruthy()
    expect(screen.getByRole("option", { name: "Open file" })).toBeTruthy()
    expect(screen.getByRole("option", { name: "Close tab" })).toBeTruthy()
  })

  it("filters options as the user types and has no axe violations", async () => {
    const user = userEvent.setup()
    render(<Example />)

    await user.type(screen.getByRole("combobox", { name: "Command menu" }), "close")

    expect(screen.queryByRole("option", { name: "Open file" })).toBeNull()
    expect(screen.getByRole("option", { name: "Close tab" })).toBeTruthy()
    await expectNoAxeViolations(document.body)
  })

  it("moves through options with arrow keys and selects the active option with Enter", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Example onSelect={onSelect} />)

    await user.click(screen.getByRole("combobox", { name: "Command menu" }))
    await user.keyboard("{ArrowDown}")
    await user.keyboard("{ArrowUp}")
    await user.keyboard("{Enter}")

    expect(onSelect).toHaveBeenCalledWith("open-file")
  })

  it("shows the empty state when no option matches the query", async () => {
    const user = userEvent.setup()
    render(<Example />)

    await user.type(screen.getByRole("combobox", { name: "Command menu" }), "missing")

    expect(screen.getByText("No commands found.")).toBeTruthy()
    expect(screen.queryByRole("option", { name: "Open file" })).toBeNull()
  })
})
