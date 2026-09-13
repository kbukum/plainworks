// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { Checkbox } from "@/atoms/checkbox"

afterEach(cleanup)

function Example() {
  return <Checkbox aria-label="Accept terms" />
}

describe("Checkbox", () => {
  it("renders with the checkbox role and accessible name", () => {
    render(<Example />)
    const checkbox = screen.getByRole("checkbox", { name: "Accept terms" })

    expect(checkbox.getAttribute("aria-checked")).toBe("false")
  })

  it("toggles when clicked", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const checkbox = screen.getByRole("checkbox", { name: "Accept terms" })

    await user.click(checkbox)
    expect(checkbox.getAttribute("aria-checked")).toBe("true")
  })

  it("toggles with Space from keyboard focus", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const checkbox = screen.getByRole("checkbox", { name: "Accept terms" })

    await user.tab()
    expect(checkbox).toBe(document.activeElement)
    await user.keyboard(" ")
    expect(checkbox.getAttribute("aria-checked")).toBe("true")
  })

  it("has no axe violations after toggling", async () => {
    const user = userEvent.setup()
    const { container } = render(<Example />)

    await user.click(screen.getByRole("checkbox", { name: "Accept terms" }))
    await expectNoAxeViolations(container)
  })
})
