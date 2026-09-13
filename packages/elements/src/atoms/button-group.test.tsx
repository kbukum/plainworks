// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "@/atoms/button-group"

afterEach(cleanup)

function Example() {
  return (
    <ButtonGroup aria-label="Text formatting">
      <button type="button">Bold</button>
      <ButtonGroupSeparator />
      <button type="button">Italic</button>
      <ButtonGroupText>2 selected</ButtonGroupText>
    </ButtonGroup>
  )
}

describe("ButtonGroup", () => {
  it("renders a named group containing named buttons", () => {
    render(<Example />)

    expect(screen.getByRole("group", { name: "Text formatting" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Bold" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Italic" })).toBeTruthy()
    expect(screen.getByText("2 selected")).toBeTruthy()
  })

  it("allows keyboard tabbing through each button", async () => {
    const user = userEvent.setup()
    render(<Example />)

    const bold = screen.getByRole("button", { name: "Bold" })
    const italic = screen.getByRole("button", { name: "Italic" })

    await user.tab()
    expect(bold).toBe(document.activeElement)
    await user.tab()
    expect(italic).toBe(document.activeElement)
  })

  it("has no axe violations", async () => {
    const { container } = render(<Example />)
    await expectNoAxeViolations(container)
  })
})
