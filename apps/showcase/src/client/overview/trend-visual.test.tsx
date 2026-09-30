// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { revenueTicks, TrendVisual } from "./trend-visual"

afterEach(cleanup)

const RISING = {
  total: 250,
  growth: -2,
  data: [
    { date: "2024-01-01", value: 100 },
    { date: "2024-01-02", value: 150 },
  ],
}

describe("revenueTicks", () => {
  it("rounds the top of the scale up to a readable step from zero", () => {
    expect(revenueTicks(150)).toEqual([0, 100, 200])
    expect(revenueTicks(4_380)).toEqual([0, 2_500, 5_000])
    expect(revenueTicks(1_000)).toEqual([0, 500, 1_000])
  })

  it("keeps a usable scale for an all-zero series", () => {
    expect(revenueTicks(0)).toEqual([0, 1, 2])
  })
})

describe("TrendVisual", () => {
  it("labels the value axis and plots against a zero baseline", async () => {
    const { container } = render(<TrendVisual revenue={RISING} />)

    const axis = screen.getByTestId("trend-value-axis")
    expect([...axis.children].map((tick) => tick.textContent)).toEqual(["$0", "$100", "$200"])
    const polyline = container.querySelector("polyline")
    expect(polyline?.getAttribute("points")).toBe("0,15 100,7.5")
    await expectNoAxeViolations(container)
  })

  it("labels the time axis with the first and last day", () => {
    render(<TrendVisual revenue={RISING} />)
    const axis = screen.getByTestId("trend-time-axis")
    expect(axis.textContent).toContain("Jan 1, 2024")
    expect(axis.textContent).toContain("Jan 2, 2024")
  })

  it("keeps the data available as a table and the change in words", () => {
    render(<TrendVisual revenue={RISING} />)
    expect(screen.getByRole("table", { name: "Revenue by day over the period" })).toBeDefined()
    expect(screen.getAllByRole("row")).toHaveLength(3)
    expect(screen.getByText(/decrease over the period/)).toBeDefined()
  })

  it("draws a single day as one point", () => {
    const { container } = render(
      <TrendVisual
        revenue={{ total: 100, growth: 0, data: [{ date: "2024-01-01", value: 100 }] }}
      />,
    )
    expect(container.querySelector("polyline")?.getAttribute("points")).toBe("50,0")
    expect(screen.getByText(/no change over the period/)).toBeDefined()
  })
})
