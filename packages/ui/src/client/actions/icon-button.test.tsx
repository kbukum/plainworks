// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { IconButton } from "./icon-button"

afterEach(cleanup)

describe("IconButton", () => {
  it("names the button from its label and hides the icon from assistive tech", async () => {
    const { container } = render(<IconButton label="Open navigation" icon={<svg />} />)
    const button = screen.getByRole("button", { name: "Open navigation" })
    expect(button.querySelector("svg")).not.toBeNull()
    await expectNoAxeViolations(container)
  })

  it("shows the label as a tooltip on keyboard focus", async () => {
    const user = userEvent.setup()
    render(<IconButton label="Open navigation" icon={<svg />} />)

    await user.tab()

    // The name comes from `aria-label`; the tooltip is the visible copy of it for sighted users.
    expect(await screen.findByText("Open navigation")).toBeDefined()
  })

  it("runs its action from the keyboard", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<IconButton label="Refresh" icon={<svg />} onClick={onClick} />)

    await user.tab()
    await user.keyboard("{Enter}")

    expect(onClick).toHaveBeenCalledOnce()
  })

  it("keeps at least a 24px target at its smallest size", () => {
    render(<IconButton label="Close" icon={<svg />} size="icon-xs" />)
    expect(screen.getByRole("button", { name: "Close" }).className).toContain("size-6")
  })
})
