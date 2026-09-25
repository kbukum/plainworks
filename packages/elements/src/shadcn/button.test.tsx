// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Button } from "@/shadcn/button"

afterEach(cleanup)

describe("Button", () => {
  it("renders a real button with an accessible name and a non-submitting type", () => {
    render(<Button>Save</Button>)
    const control = screen.getByRole("button", { name: "Save" })

    expect(control.tagName).toBe("BUTTON")
    // Defaults to type="button" so a stray button never submits an enclosing form.
    expect(control.getAttribute("type")).toBe("button")
  })

  it("fires its handler on click and on keyboard activation", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    const control = screen.getByRole("button", { name: "Save" })

    // Clicking focuses the button; Enter and Space then activate it from the keyboard.
    await user.click(control)
    await user.keyboard("{Enter}")
    await user.keyboard(" ")

    expect(onClick).toHaveBeenCalledTimes(3)
  })

  it("takes keyboard focus by Tab", async () => {
    const user = userEvent.setup()
    render(<Button>Save</Button>)

    await user.tab()
    expect(screen.getByRole("button", { name: "Save" })).toBe(document.activeElement)
  })

  it("does not fire when disabled", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    )

    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it("exposes an invalid state to assistive tech", () => {
    render(<Button aria-invalid>Save</Button>)
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-invalid")).toBe("true")
  })

  it("has no axe violations", async () => {
    const { container } = render(<Button>Save</Button>)
    await expectNoAxeViolations(container)
  })
})
