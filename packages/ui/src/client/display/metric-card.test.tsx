// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { MetricCard, MetricList } from "./metric-card"

afterEach(cleanup)

describe("MetricCard", () => {
  it("shows the label, value, and supporting line", async () => {
    const { container } = render(
      <MetricList>
        <MetricCard label="Revenue" value="$1,200" detail="Up 4% from last period" />
        <MetricCard label="Orders" detail="Loading" />
      </MetricList>,
    )
    const revenue = container.querySelectorAll('[data-slot="metric-card"]')[0] as HTMLElement
    expect(within(revenue).getByText("Revenue")).toBeDefined()
    expect(within(revenue).getByText("$1,200")).toBeDefined()
    expect(within(revenue).getByText("Up 4% from last period")).toBeDefined()
    expect(screen.getByText("Loading")).toBeDefined()
    await expectNoAxeViolations(container)
  })

  it("reflows by its container from one column to four", () => {
    const { container } = render(
      <MetricList>
        <MetricCard label="Users" value="10" />
      </MetricList>,
    )
    const root = container.querySelector('[data-slot="metric-list"]')
    expect(root?.className).toContain("@container/metric-list")
    const grid = root?.firstElementChild?.className ?? ""
    expect(grid).toContain("grid-cols-1")
    expect(grid).toContain("@4xl/metric-list:grid-cols-4")
  })
})
