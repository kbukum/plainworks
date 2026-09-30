// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Sparkline, sparklinePoints } from "./sparkline"

afterEach(cleanup)

describe("sparklinePoints", () => {
  it("projects values onto a zero-based scale across the full width", () => {
    expect(sparklinePoints([0, 5, 10], 10)).toEqual([
      { x: 0, y: 30 },
      { x: 50, y: 15 },
      { x: 100, y: 0 },
    ])
  })

  it("centres a single value and keeps an empty or zero series on the baseline", () => {
    expect(sparklinePoints([4], 8)).toEqual([{ x: 50, y: 15 }])
    expect(sparklinePoints([0, 0], 0)).toEqual([
      { x: 0, y: 30 },
      { x: 100, y: 30 },
    ])
    expect(sparklinePoints([], 10)).toEqual([])
  })

  it("clamps values outside the scale to its edges", () => {
    expect(sparklinePoints([-3, 20], 10)).toEqual([
      { x: 0, y: 30 },
      { x: 100, y: 0 },
    ])
  })
})

describe("Sparkline", () => {
  it("is a named image when labelled", async () => {
    const { container } = render(<Sparkline values={[1, 3, 2]} label="Weekly signups" />)
    const image = screen.getByRole("img", { name: "Weekly signups" })
    expect(image.querySelector("polyline")).not.toBeNull()
    await expectNoAxeViolations(container)
  })

  it("is hidden from assistive tech when unlabelled, so a caller can describe the data", async () => {
    const { container } = render(<Sparkline values={[1, 3, 2]} />)
    expect(screen.queryByRole("img")).toBeNull()
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
    await expectNoAxeViolations(container)
  })

  it("draws one bar per value in the bar variant", () => {
    render(<Sparkline variant="bar" values={[2, 4, 6, 8]} label="Sales" />)
    expect(screen.getByRole("img", { name: "Sales" }).querySelectorAll("rect")).toHaveLength(4)
  })

  it("draws a gridline at each requested value", () => {
    const { container } = render(<Sparkline values={[2, 8]} max={10} gridlines={[0, 5, 10]} />)
    const ys = [...container.querySelectorAll("line")].map((line) => line.getAttribute("y1"))
    expect(ys).toEqual(["30", "15", "0"])
  })
})
