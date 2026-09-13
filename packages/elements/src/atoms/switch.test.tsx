// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { Switch } from "@/atoms/switch"

afterEach(cleanup)

function Example() {
  return <Switch aria-label="Enable notifications" />
}

describe("Switch", () => {
  it("renders with the switch role and accessible name", () => {
    render(<Example />)
    const control = screen.getByRole("switch", { name: "Enable notifications" })

    expect(control.getAttribute("aria-checked")).toBe("false")
  })

  it("toggles when clicked", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const control = screen.getByRole("switch", { name: "Enable notifications" })

    await user.click(control)
    expect(control.getAttribute("aria-checked")).toBe("true")
  })

  it("toggles with Space from keyboard focus", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const control = screen.getByRole("switch", { name: "Enable notifications" })

    await user.tab()
    expect(control).toBe(document.activeElement)
    await user.keyboard(" ")
    expect(control.getAttribute("aria-checked")).toBe("true")
  })

  it("has no axe violations after toggling", async () => {
    const user = userEvent.setup()
    const { container } = render(<Example />)

    await user.click(screen.getByRole("switch", { name: "Enable notifications" }))
    await expectNoAxeViolations(container)
  })
})
