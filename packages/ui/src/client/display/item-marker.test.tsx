// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ItemMarker, markerFor } from "./item-marker"

afterEach(cleanup)

describe("markerFor", () => {
  it("letters the first eight items A to H, each with its own color", () => {
    expect([0, 1, 7].map(markerFor)).toEqual([
      { letter: "A", color: "series-1" },
      { letter: "B", color: "series-2" },
      { letter: "H", color: "series-8" },
    ])
  })

  it("repeats letters with a number after eight, so no two items share a label", () => {
    expect(markerFor(8)).toEqual({ letter: "A2", color: "series-1" })
    expect(markerFor(17)).toEqual({ letter: "B3", color: "series-2" })
  })

  it("refuses an index that is not a non-negative integer", () => {
    expect(() => markerFor(-1)).toThrow(RangeError)
    expect(() => markerFor(1.5)).toThrow(RangeError)
  })
})

describe("ItemMarker", () => {
  it("shows the letter and the name together, never color alone", async () => {
    const { container } = render(<ItemMarker index={2}>qwen2.5:7b</ItemMarker>)
    const marker = container.querySelector('[data-slot="item-marker"]')
    expect(marker?.textContent).toBe("Cqwen2.5:7b")
    expect(container.querySelector('[data-series="series-3"]')?.textContent).toBe("C")
    expect(screen.getByText("qwen2.5:7b")).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it("renders the badge alone when the name is shown elsewhere", () => {
    const { container } = render(<ItemMarker index={0} />)
    expect(container.textContent).toBe("A")
  })
})
