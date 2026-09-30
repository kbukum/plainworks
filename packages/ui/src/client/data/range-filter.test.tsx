// @vitest-environment jsdom

import type { ListFilter } from "@plainworks/std/list"
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { RangeFilter } from "./range-filter"

afterEach(cleanup)

const other: ListFilter = { field: "status", op: "in", value: ["open"] }

function Harness({ seen }: { readonly seen: (readonly ListFilter[])[] }) {
  const [filters, setFilters] = useState<readonly ListFilter[]>([other])
  return (
    <main>
      <RangeFilter
        field="price"
        value={filters}
        onChange={(next) => {
          setFilters(next)
          seen.push(next)
        }}
        labels={{ legend: "Price" }}
      />
    </main>
  )
}

describe("RangeFilter", () => {
  it("is a named group with a labelled min and max field", async () => {
    render(<Harness seen={[]} />)
    const group = screen.getByRole("group", { name: "Price" })
    expect(within(group).getByRole("textbox", { name: "Min" })).toBeDefined()
    expect(within(group).getByRole("textbox", { name: "Max" })).toBeDefined()
    await expectNoAxeViolations(document.body)
  })

  it("writes `gte`/`lte` bounds beside other filters and drops a cleared bound", async () => {
    const seen: (readonly ListFilter[])[] = []
    const user = userEvent.setup()
    render(<Harness seen={seen} />)
    const min = screen.getByRole("textbox", { name: "Min" })
    await user.type(min, "10")
    await user.tab()
    expect(seen.at(-1)).toEqual([other, { field: "price", op: "gte", value: 10 }])

    await user.type(screen.getByRole("textbox", { name: "Max" }), "50")
    await user.tab()
    expect(seen.at(-1)).toEqual([
      other,
      { field: "price", op: "gte", value: 10 },
      { field: "price", op: "lte", value: 50 },
    ])

    await user.clear(min)
    await user.tab()
    expect(seen.at(-1)).toEqual([other, { field: "price", op: "lte", value: 50 }])
  })

  it("never goes below its minimum", async () => {
    const seen: (readonly ListFilter[])[] = []
    const user = userEvent.setup()
    render(<Harness seen={seen} />)
    await user.type(screen.getByRole("textbox", { name: "Min" }), "-5")
    await user.tab()
    const bounds = seen.flat().flatMap((filter) => ("value" in filter ? [filter.value] : []))
    expect(bounds.some((bound) => typeof bound === "number" && bound < 0)).toBe(false)
  })
})
