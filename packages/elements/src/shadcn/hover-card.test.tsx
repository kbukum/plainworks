// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/shadcn/hover-card"

afterEach(cleanup)

function Example() {
  return (
    <HoverCard>
      <HoverCardTrigger href="/authors/ada">Preview author</HoverCardTrigger>
      <HoverCardContent aria-label="Author preview">
        <p>Ada Lovelace</p>
        <p>Wrote notes on the Analytical Engine.</p>
      </HoverCardContent>
    </HoverCard>
  )
}

describe("HoverCard", () => {
  it("exposes the trigger as a link and hides the hover card until opened", () => {
    render(<Example />)
    expect(screen.getByRole("link", { name: "Preview author" })).toBeTruthy()
    expect(screen.queryByLabelText("Author preview")).toBeNull()
  })

  it("opens on hover with labeled content and no axe violations", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.hover(screen.getByRole("link", { name: "Preview author" }))

    const hoverCard = await screen.findByLabelText("Author preview")
    expect(hoverCard).toBeTruthy()
    expect(screen.getByText("Ada Lovelace")).toBeTruthy()
    await expectNoAxeViolations(hoverCard)
  })

  it("opens from keyboard focus and closes on Escape", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByRole("link", { name: "Preview author" })

    await user.tab()
    expect(trigger).toBe(document.activeElement)
    expect(await screen.findByLabelText("Author preview")).toBeTruthy()

    await user.keyboard("{Escape}")
    expect(screen.queryByLabelText("Author preview")).toBeNull()
  })
})
