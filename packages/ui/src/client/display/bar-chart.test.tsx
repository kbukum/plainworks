// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { barChartSummary, barHeight, GroupedBarChart } from "./bar-chart"

afterEach(cleanup)

describe("barHeight", () => {
  it("projects onto a zero-based scale and clamps", () => {
    expect(barHeight(5, 10)).toBe(20)
    expect(barHeight(-1, 10)).toBe(0)
    expect(barHeight(20, 10)).toBe(40)
    expect(barHeight(3, 0)).toBe(0)
    expect(barHeight(Number.NaN, 10)).toBe(0)
  })
})

describe("barChartSummary", () => {
  it("names every series value and says when one is not available", () => {
    expect(
      barChartSummary(
        ["qwen", "llama"],
        [
          { label: "Exact match", values: [0.8, null] },
          { label: "p95 latency", values: [1200, 900], format: (v) => `${v} ms` },
        ],
      ),
    ).toBe(
      "Exact match: A qwen 0.80, B llama not available. p95 latency: A qwen 1200 ms, B llama 900 ms.",
    )
  })
})

describe("GroupedBarChart", () => {
  it("draws a bar per available value, labels each bar and shows the summary as text", async () => {
    const { container } = render(
      <GroupedBarChart
        series={["qwen", "llama", "phi"]}
        groups={[{ label: "Exact match", values: [1, 0.5, null] }]}
      />,
    )
    const rects = container.querySelectorAll("rect")
    expect(rects).toHaveLength(2)
    expect(rects[0]?.getAttribute("data-series")).toBe("series-1")
    expect(rects[1]?.getAttribute("height")).toBe("20")
    expect(container.querySelector('[data-slot="bar-group"]')?.textContent).toContain("—")
    expect(screen.getByText(/C phi not available/)).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it("never draws zero for an unavailable value", () => {
    const { container } = render(
      <GroupedBarChart series={["a"]} groups={[{ label: "Cost", values: [null] }]} />,
    )
    expect(container.querySelectorAll("rect")).toHaveLength(0)
    expect(container.textContent).not.toContain("0.00")
  })

  it("keeps each bar in one column with its own label, so long values never run together", () => {
    const { container } = render(
      <GroupedBarChart
        series={["a", "b"]}
        groups={[{ label: "p95 latency", values: [1200, 900], format: (v) => `${v} ms` }]}
      />,
    )
    const bars = [...container.querySelectorAll('[data-slot="bar"]')]
    expect(
      bars.map((b) => [b.querySelector("rect")?.getAttribute("data-series"), b.textContent]),
    ).toEqual([
      ["series-1", "A1200 ms"],
      ["series-2", "B900 ms"],
    ])
  })
})
