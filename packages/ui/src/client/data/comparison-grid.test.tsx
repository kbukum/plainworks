// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ComparisonGrid } from "./comparison-grid"

afterEach(cleanup)

const columns = [
  { id: "a", label: "llama3.2", header: <strong>llama3.2</strong> },
  { id: "b", label: "qwen2.5" },
]
const rows = [
  { id: "c1", header: "Say hello" },
  { id: "c2", header: "Count to three" },
]

describe("ComparisonGrid", () => {
  it("is a named table with items as columns and cases as rows", async () => {
    const { container } = render(
      <ComparisonGrid
        label="Answers"
        corner="Case"
        columns={columns}
        rows={rows}
        cell={(row, column) => `${column.label}:${row.id}`}
      />,
    )
    const table = screen.getByRole("table", { name: "Answers" })
    expect(table.querySelector("caption")?.textContent).toBe("Answers")
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Case",
      "llama3.2",
      "qwen2.5",
    ])
    const second = screen.getAllByRole("row")[2]
    if (second === undefined) throw new Error("row missing")
    expect(within(second).getByRole("rowheader").textContent).toBe("Count to three")
    expect(
      within(second)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["llama3.2llama3.2:c2", "qwen2.5qwen2.5:c2"])
    await expectNoAxeViolations(container)
  })

  it("is a focusable scroll region whose padding follows the sticky headers", () => {
    render(<ComparisonGrid label="Answers" columns={columns} rows={rows} cell={() => "x"} />)
    const region = screen.getByRole("region", { name: "Answers" })
    expect(region.tabIndex).toBe(0)
    expect(region.style.scrollPaddingTop).toBe("0px")
  })

  it("pads the scroll region only by headers that stick", () => {
    const style = vi
      .spyOn(window, "getComputedStyle")
      .mockImplementation(
        (el) => ({ position: el.tagName === "THEAD" ? "sticky" : "static" }) as CSSStyleDeclaration,
      )
    const box = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue(DOMRect.fromRect({ width: 120, height: 48 }))
    try {
      const { container } = render(
        <ComparisonGrid label="Answers" columns={columns} rows={rows} cell={() => "x"} />,
      )
      // Role queries read computed styles, which this test stubs, so the region is found directly.
      const region = container.querySelector<HTMLElement>("[data-slot=comparison-grid]")
      if (region === null) throw new Error("region missing")
      expect(region.style.scrollPaddingTop).toBe("48px")
      expect(region.style.scrollPaddingInlineStart).toBe("0px")
    } finally {
      style.mockRestore()
      box.mockRestore()
    }
  })

  it("keeps each item's header visible for the stacked layout", () => {
    render(<ComparisonGrid label="Answers" columns={columns} rows={rows} cell={() => "x"} />)
    const header = screen.getByText("llama3.2", { selector: "strong" })
    expect(header.closest("[class*='sr-only']")).toBeNull()
  })

  it("labels each cell with its item for the stacked layout", () => {
    render(<ComparisonGrid label="Answers" columns={columns} rows={rows} cell={() => "answer"} />)
    const cells = screen.getAllByRole("cell")
    expect(cells.map((c) => c.textContent)).toEqual([
      "llama3.2answer",
      "qwen2.5answer",
      "llama3.2answer",
      "qwen2.5answer",
    ])
  })
})
