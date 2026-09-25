// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shadcn/collapsible"

afterEach(cleanup)

function Example() {
  return (
    <Collapsible>
      <CollapsibleTrigger>Show details</CollapsibleTrigger>
      <CollapsibleContent>Extra settings panel</CollapsibleContent>
    </Collapsible>
  )
}

describe("Collapsible", () => {
  it("renders a collapsed trigger button", () => {
    render(<Example />)

    const trigger = screen.getByRole("button", { name: "Show details" })
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByText("Extra settings panel")).toBeNull()
  })

  it("toggles the panel on trigger click", async () => {
    const user = userEvent.setup()
    render(<Example />)

    const trigger = screen.getByRole("button", { name: "Show details" })
    await user.click(trigger)

    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("Extra settings panel")).toBeTruthy()

    await user.click(trigger)
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByText("Extra settings panel")).toBeNull()
  })

  it("toggles with Enter and Space from the keyboard", async () => {
    const user = userEvent.setup()
    render(<Example />)

    const trigger = screen.getByRole("button", { name: "Show details" })
    await user.tab()
    expect(trigger).toBe(document.activeElement)

    await user.keyboard("{Enter}")
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("Extra settings panel")).toBeTruthy()

    await user.keyboard(" ")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByText("Extra settings panel")).toBeNull()
  })

  it("has no axe violations when open", async () => {
    const user = userEvent.setup()
    const { container } = render(<Example />)

    await user.click(screen.getByRole("button", { name: "Show details" }))
    await expectNoAxeViolations(container)
  })
})
