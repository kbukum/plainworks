// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { MetricValue } from "./metric-value"

afterEach(cleanup)

const text = (container: HTMLElement) =>
  container.querySelector('[data-slot="metric-value"]')?.textContent

describe("MetricValue", () => {
  it("formats the value with a smaller muted unit", async () => {
    const { container } = render(
      <MetricValue
        value={1234.5}
        unit="ms"
        locale="en-US"
        options={{ maximumFractionDigits: 0 }}
      />,
    )
    expect(text(container)).toBe("1,235 ms")
    expect(container.querySelector('[data-slot="metric-unit"]')?.className).toContain(
      "text-muted-foreground",
    )
    await expectNoAxeViolations(container)
  })

  it("keeps a real zero", () => {
    const { container } = render(<MetricValue value={0} locale="en-US" />)
    expect(text(container)).toBe("0")
  })

  it("says why a value is missing instead of showing zero", () => {
    const { container, rerender } = render(<MetricValue value={undefined} locale="en-US" />)
    expect(text(container)).toBe("not measured")
    rerender(<MetricValue value={undefined} missing="unknown" unit="ms" locale="en-US" />)
    expect(text(container)).toBe("unknown")
    rerender(<MetricValue value={Number.NaN} locale="en-US" />)
    expect(text(container)).toBe("not measured")
  })

  it("takes localized words for missing values", () => {
    const { container } = render(
      <MetricValue value={undefined} locale="de-DE" labels={{ notMeasured: "nicht gemessen" }} />,
    )
    expect(text(container)).toBe("nicht gemessen")
  })
})
