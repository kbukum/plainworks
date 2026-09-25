// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { Slider } from "@/shadcn/slider"

afterEach(cleanup)

function Example() {
  return (
    <>
      <span id="volume-label">Volume</span>
      <Slider
        aria-labelledby="volume-label"
        defaultValue={[40]}
        min={0}
        max={100}
        thumbAlignment="center"
      />
    </>
  )
}

describe("Slider", () => {
  it("renders with the slider role, accessible name, and value bounds", () => {
    render(<Example />)
    const slider = screen.getByRole("slider", { name: "Volume" })

    expect(slider.getAttribute("aria-valuenow")).toBe("40")
    expect(slider.getAttribute("aria-valuemin") ?? slider.getAttribute("min")).toBe("0")
    expect(slider.getAttribute("aria-valuemax") ?? slider.getAttribute("max")).toBe("100")
  })

  it("increases when ArrowRight is pressed", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const slider = screen.getByRole("slider", { name: "Volume" })

    await user.tab()
    expect(slider).toBe(document.activeElement)
    await user.keyboard("{ArrowRight}")
    expect(slider.getAttribute("aria-valuenow")).toBe("41")
  })

  it("decreases when ArrowDown is pressed", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const slider = screen.getByRole("slider", { name: "Volume" })

    await user.tab()
    expect(slider).toBe(document.activeElement)
    await user.keyboard("{ArrowDown}")
    expect(slider.getAttribute("aria-valuenow")).toBe("39")
  })

  it("has no axe violations after changing value", async () => {
    const user = userEvent.setup()
    const { container } = render(<Example />)
    const slider = screen.getByRole("slider", { name: "Volume" })

    await user.tab()
    expect(slider).toBe(document.activeElement)
    await user.keyboard("{ArrowRight}")
    await expectNoAxeViolations(container)
  })
})
