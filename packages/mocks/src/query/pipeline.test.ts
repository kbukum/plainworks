import { describe, expect, it } from "vitest"
import { applyFieldSelection } from "./field-selection"
import { paginate } from "./pagination"
import { sortBy } from "./sorting"

describe("paginate", () => {
  const items = Array.from({ length: 25 }, (_, i) => i)

  it("slices by page and limit", () => {
    const result = paginate(items, { page: 2, limit: 10 })
    expect(result.data).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    expect(result.pagination).toEqual({ page: 2, pageSize: 10, total: 25, totalPages: 3 })
  })

  it("supports pageSize alias and defaults", () => {
    expect(paginate(items).pagination.pageSize).toBe(10)
    expect(paginate(items, { pageSize: 5 }).pagination.pageSize).toBe(5)
  })
})

describe("sortBy", () => {
  const rows = [
    { n: 3, s: "c" },
    { n: 1, s: "a" },
    { n: 2, s: "b" },
  ]

  it("returns items unchanged without a field", () => {
    expect(sortBy(rows)).toBe(rows)
  })

  it("sorts numbers ascending and descending", () => {
    expect(sortBy(rows, { field: "n" }).map((r) => r.n)).toEqual([1, 2, 3])
    expect(sortBy(rows, { field: "n", order: "desc" }).map((r) => r.n)).toEqual([3, 2, 1])
  })

  it("sorts strings lexically", () => {
    expect(sortBy(rows, { field: "s" }).map((r) => r.s)).toEqual(["a", "b", "c"])
  })

  it("pushes null and undefined to the end", () => {
    const withGaps = [{ v: 2 }, { v: null }, { v: 1 }]
    expect(sortBy(withGaps, { field: "v" }).map((r) => r.v)).toEqual([1, 2, null])
  })
})

describe("applyFieldSelection", () => {
  const items = [{ id: "1", name: "a", email: "e" }]

  it("returns items unchanged when no fields requested", () => {
    expect(applyFieldSelection(items, undefined)).toBe(items)
    expect(applyFieldSelection(items, " , ")).toBe(items)
  })

  it("keeps only the selected, existing fields", () => {
    expect(applyFieldSelection(items, "id, name, missing")).toEqual([{ id: "1", name: "a" }])
  })
})
