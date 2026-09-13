// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/atoms/tooltip"

afterEach(cleanup)

function Example() {
  return (
    <main>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger aria-label="Show sync help">?</TooltipTrigger>
          <TooltipContent role="tooltip">Changes sync automatically.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </main>
  )
}

describe("Tooltip", () => {
  it("exposes the trigger as a named button and hides the tooltip until opened", async () => {
    const { container } = render(<Example />)
    expect(screen.getByRole("button", { name: "Show sync help" })).toBeTruthy()
    expect(screen.queryByRole("tooltip")).toBeNull()
    await expectNoAxeViolations(container)
  })

  it("opens on hover with tooltip semantics and no axe violations", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.hover(screen.getByRole("button", { name: "Show sync help" }))

    const tooltip = await screen.findByRole("tooltip")
    expect(tooltip.textContent).toContain("Changes sync automatically.")
    await expectNoAxeViolations(tooltip)
  })

  it("opens from keyboard focus and closes on Escape", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByRole("button", { name: "Show sync help" })

    await user.tab()
    expect(trigger).toBe(document.activeElement)
    expect(await screen.findByRole("tooltip")).toBeTruthy()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("tooltip")).toBeNull()
  })
})
