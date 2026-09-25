// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/shadcn/select"

afterEach(cleanup)

function Example() {
  return (
    <main>
      <Select defaultValue="Apple">
        <SelectTrigger aria-label="Favorite fruit">
          <SelectValue placeholder="Choose a fruit" />
        </SelectTrigger>
        <SelectContent role="region" aria-label="Favorite fruit options">
          <SelectGroup>
            <SelectLabel>Fruits</SelectLabel>
            <SelectItem value="Apple">Apple</SelectItem>
            <SelectItem value="Banana">Banana</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </main>
  )
}

describe("Select", () => {
  it("renders a named trigger with the selected value and no listbox while closed", () => {
    render(<Example />)

    expect(screen.getByRole("combobox", { name: "Favorite fruit" }).textContent).toContain("Apple")
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("opens the portaled listbox from the trigger with no axe violations", async () => {
    const user = userEvent.setup()
    render(<Example />)

    await user.click(screen.getByRole("combobox", { name: "Favorite fruit" }))

    expect(await screen.findByRole("listbox")).toBeTruthy()
    expect(await screen.findByRole("option", { name: "Banana" })).toBeTruthy()
    await expectNoAxeViolations(document.body)
  })

  it("selects an option, updates the trigger value, and closes the listbox", async () => {
    const user = userEvent.setup()
    render(<Example />)

    const trigger = screen.getByRole("combobox", { name: "Favorite fruit" })
    await user.click(trigger)
    await user.click(await screen.findByRole("option", { name: "Banana" }))

    expect(trigger.textContent).toContain("Banana")
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("closes the listbox on Escape", async () => {
    const user = userEvent.setup()
    render(<Example />)

    await user.click(screen.getByRole("combobox", { name: "Favorite fruit" }))
    expect(await screen.findByRole("listbox")).toBeTruthy()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("listbox")).toBeNull()
  })
})
