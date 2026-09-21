// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { TrendVisual } from "./trend-visual"

afterEach(cleanup)

describe("TrendVisual", () => {
  it("places a constant series on the mid-line and presents zero growth as no change", async () => {
    const revenue = {
      total: 300,
      growth: 0,
      data: [
        { date: "2024-01-01", value: 100 },
        { date: "2024-01-02", value: 100 },
        { date: "2024-01-03", value: 100 },
      ],
    }
    const { container } = render(<TrendVisual revenue={revenue} />)
    const polyline = container.querySelector("polyline")
    expect(polyline?.getAttribute("points")).toBe("0.00,15.00 50.00,15.00 100.00,15.00")
    expect(screen.getByText(/no change over the period/)).toBeDefined()
    await expectNoAxeViolations(container)
  })

  it("places a single point on the mid-line", () => {
    const revenue = {
      total: 100,
      growth: 0,
      data: [{ date: "2024-01-01", value: 100 }],
    }
    const { container } = render(<TrendVisual revenue={revenue} />)
    const polyline = container.querySelector("polyline")
    expect(polyline?.getAttribute("points")).toBe("0.00,15.00")
  })

  it("exposes the visible period and date range without relying on the line color", async () => {
    const { container } = render(
      <TrendVisual
        revenue={{
          total: 250,
          growth: -2,
          data: [
            { date: "2024-01-01", value: 100 },
            { date: "2024-01-02", value: 150 },
          ],
        }}
      />,
    )

    expect(screen.getAllByText(/Jan 1, 2024/)).toHaveLength(2)
    expect(screen.getAllByText(/Jan 2, 2024/)).toHaveLength(2)
    expect(screen.getByText(/decrease over the period/)).toBeDefined()
    await expectNoAxeViolations(container)
  })
})
