// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { Label } from "@/shadcn/label"
import { RadioGroup, RadioGroupItem } from "@/shadcn/radio-group"

afterEach(cleanup)

function Example() {
  return (
    <RadioGroup defaultValue="light" aria-label="Theme">
      <Label>
        <RadioGroupItem value="light" /> Light
      </Label>
      <Label>
        <RadioGroupItem value="dark" /> Dark
      </Label>
      <Label>
        <RadioGroupItem value="system" /> System
      </Label>
    </RadioGroup>
  )
}

describe("RadioGroup", () => {
  it("renders a named radiogroup with named radio options", () => {
    render(<Example />)
    const group = screen.getByRole("radiogroup", { name: "Theme" })
    const light = screen.getByRole("radio", { name: "Light" })
    const dark = screen.getByRole("radio", { name: "Dark" })

    expect(group).toBeTruthy()
    expect(light.getAttribute("aria-checked")).toBe("true")
    expect(dark.getAttribute("aria-checked")).toBe("false")
  })

  it("selects an option when clicked", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const light = screen.getByRole("radio", { name: "Light" })
    const dark = screen.getByRole("radio", { name: "Dark" })

    await user.click(dark)
    expect(light.getAttribute("aria-checked")).toBe("false")
    expect(dark.getAttribute("aria-checked")).toBe("true")
  })

  it("moves selection with Arrow keys from keyboard focus", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const light = screen.getByRole("radio", { name: "Light" })
    const dark = screen.getByRole("radio", { name: "Dark" })
    const system = screen.getByRole("radio", { name: "System" })

    await user.tab()
    expect(light).toBe(document.activeElement)
    await user.keyboard("{ArrowDown}")
    expect(dark.getAttribute("aria-checked")).toBe("true")
    await user.keyboard("{ArrowRight}")
    expect(system.getAttribute("aria-checked")).toBe("true")
  })

  it("has no axe violations after changing selection", async () => {
    const user = userEvent.setup()
    const { container } = render(<Example />)

    await user.click(screen.getByRole("radio", { name: "Dark" }))
    await expectNoAxeViolations(container)
  })
})
