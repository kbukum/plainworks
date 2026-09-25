// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { Toggle } from "@/shadcn/toggle"

afterEach(cleanup)

function Example() {
  return <Toggle aria-label="Bold">Bold</Toggle>
}

describe("Toggle", () => {
  it("renders as a button with an accessible pressed state", () => {
    render(<Example />)
    const button = screen.getByRole("button", { name: "Bold" })

    expect(button.getAttribute("aria-pressed")).toBe("false")
  })

  it("toggles when clicked", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const button = screen.getByRole("button", { name: "Bold" })

    await user.click(button)
    expect(button.getAttribute("aria-pressed")).toBe("true")
  })

  it("toggles with Space from keyboard focus", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const button = screen.getByRole("button", { name: "Bold" })

    await user.tab()
    expect(button).toBe(document.activeElement)
    await user.keyboard(" ")
    expect(button.getAttribute("aria-pressed")).toBe("true")
  })

  it("has no axe violations after toggling", async () => {
    const user = userEvent.setup()
    const { container } = render(<Example />)

    await user.click(screen.getByRole("button", { name: "Bold" }))
    await expectNoAxeViolations(container)
  })
})
