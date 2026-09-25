// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as React from "react"
import { afterEach, describe, expect, it } from "vitest"
import { Calendar } from "@/shadcn/calendar"

afterEach(cleanup)

function SingleDateCalendar({ initialSelected }: { initialSelected?: Date }) {
  const [selected, setSelected] = React.useState<Date | undefined>(initialSelected)

  return (
    <Calendar
      mode="single"
      defaultMonth={new Date(2026, 0, 1)}
      selected={selected}
      onSelect={setSelected}
    />
  )
}

describe("Calendar", () => {
  it("renders month navigation with accessible names", () => {
    render(<SingleDateCalendar initialSelected={new Date(2026, 0, 1)} />)

    expect(screen.getByRole("button", { name: /previous month/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /next month/i })).toBeTruthy()
  })

  it("selects a day button in single-date mode", async () => {
    const user = userEvent.setup()
    render(<SingleDateCalendar initialSelected={new Date(2026, 0, 1)} />)

    const day = screen.getByRole("button", { name: /january 15/i })
    await user.click(day)

    const selectedDay = screen.getByRole("button", { name: /january 15.*selected/i })
    expect(selectedDay.getAttribute("data-selected-single")).toBe("true")
  })

  it("places a day button in the keyboard tab order", async () => {
    const user = userEvent.setup()
    render(<SingleDateCalendar initialSelected={new Date(2026, 0, 1)} />)

    await user.tab()
    await user.tab()
    await user.tab()

    const day = screen.getByRole("button", { name: /thursday, january 1st, 2026/i })
    expect(day).toBe(document.activeElement)
  })

  it("has no axe violations", async () => {
    const { container } = render(<SingleDateCalendar />)
    await expectNoAxeViolations(container)
  })
})
