// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/shadcn/accordion"

afterEach(cleanup)

function Example() {
  return (
    <Accordion>
      <AccordionItem value="one">
        <AccordionTrigger>First section</AccordionTrigger>
        <AccordionContent>First panel body</AccordionContent>
      </AccordionItem>
      <AccordionItem value="two">
        <AccordionTrigger>Second section</AccordionTrigger>
        <AccordionContent>Second panel body</AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

describe("Accordion", () => {
  it("renders collapsed triggers as buttons", () => {
    render(<Example />)
    const trigger = screen.getByRole("button", { name: "First section" })
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
  })

  it("expands a section on trigger click", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByRole("button", { name: "First section" })

    await user.click(trigger)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("First panel body")).toBeTruthy()
  })

  it("toggles with Enter/Space from the keyboard", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByRole("button", { name: "First section" })

    await user.tab()
    expect(trigger).toBe(document.activeElement)
    await user.keyboard("{Enter}")
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    await user.keyboard(" ")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
  })

  it("has no axe violations when expanded", async () => {
    const user = userEvent.setup()
    const { container } = render(<Example />)
    await user.click(screen.getByRole("button", { name: "First section" }))
    await expectNoAxeViolations(container)
  })
})
