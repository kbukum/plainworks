// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { ToggleGroup, ToggleGroupItem } from "@/atoms/toggle-group"

afterEach(cleanup)

function Example() {
  return (
    <ToggleGroup aria-label="Text style">
      <ToggleGroupItem value="bold" aria-label="Bold">
        Bold
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Italic">
        Italic
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

describe("ToggleGroup", () => {
  it("renders a named group with toggle buttons", () => {
    render(<Example />)
    const group = screen.getByRole("group", { name: "Text style" })
    const bold = screen.getByRole("button", { name: "Bold" })
    const italic = screen.getByRole("button", { name: "Italic" })

    expect(group).toBeTruthy()
    expect(bold.getAttribute("aria-pressed")).toBe("false")
    expect(italic.getAttribute("aria-pressed")).toBe("false")
  })

  it("toggles a member when clicked", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const bold = screen.getByRole("button", { name: "Bold" })

    await user.click(bold)
    expect(bold.getAttribute("aria-pressed")).toBe("true")
  })

  it("toggles a focused member with Space", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const bold = screen.getByRole("button", { name: "Bold" })

    await user.tab()
    expect(bold).toBe(document.activeElement)
    await user.keyboard(" ")
    expect(bold.getAttribute("aria-pressed")).toBe("true")
  })

  it("has no axe violations after toggling members", async () => {
    const user = userEvent.setup()
    const { container } = render(<Example />)

    await user.click(screen.getByRole("button", { name: "Bold" }))
    await user.click(screen.getByRole("button", { name: "Italic" }))
    await expectNoAxeViolations(container)
  })
})
