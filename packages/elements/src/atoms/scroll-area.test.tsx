// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { ScrollArea } from "@/atoms/scroll-area"

afterEach(cleanup)

function Example() {
  return (
    <ScrollArea aria-label="Messages">
      <article>
        <h2>Messages</h2>
        <p>Keyboard users can reach the content inside the viewport.</p>
        <a href="#first-message">First message</a>
        <button type="button">Archive message</button>
      </article>
    </ScrollArea>
  )
}

describe("ScrollArea", () => {
  it("renders viewport content", () => {
    render(<Example />)

    expect(screen.getByRole("heading", { name: "Messages" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "First message" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Archive message" })).toBeTruthy()
  })

  it("keeps focusable content reachable with Tab", async () => {
    const user = userEvent.setup()
    render(<Example />)

    await user.tab()
    expect(screen.getByRole("link", { name: "First message" })).toBe(document.activeElement)

    await user.tab()
    expect(screen.getByRole("button", { name: "Archive message" })).toBe(document.activeElement)
  })

  it("has no axe violations", async () => {
    const { container } = render(<Example />)
    await expectNoAxeViolations(container)
  })
})
