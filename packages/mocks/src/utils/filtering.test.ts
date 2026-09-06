import { describe, expect, it } from "vitest"
import type { FilterCondition } from "../filter"
import {
  computeFacets,
  computeFacetsWithFilters,
  filterByApiParams,
  filterByConditions,
  filterByField,
  filterByFields,
  filterBySearch,
} from "./filtering"

interface Row extends Record<string, unknown> {
  id: string
  name: string
  role: string
  age: number
  active: boolean
  bio: string | null
}

const rows: Row[] = [
  { id: "1", name: "Alice", role: "admin", age: 30, active: true, bio: "hello" },
  { id: "2", name: "Bob", role: "editor", age: 25, active: false, bio: null },
  { id: "3", name: "Carol", role: "editor", age: 40, active: true, bio: "world" },
]

describe("filterByConditions", () => {
  const run = (c: FilterCondition) => filterByConditions(rows, [c]).map((r) => r.id)

  it("eq / neq", () => {
    expect(run({ field: "role", operator: "eq", value: "editor" })).toEqual(["2", "3"])
    expect(run({ field: "role", operator: "neq", value: "editor" })).toEqual(["1"])
  })

  it("gt / gte / lt / lte", () => {
    expect(run({ field: "age", operator: "gt", value: "30" })).toEqual(["3"])
    expect(run({ field: "age", operator: "gte", value: "30" })).toEqual(["1", "3"])
    expect(run({ field: "age", operator: "lt", value: "30" })).toEqual(["2"])
    expect(run({ field: "age", operator: "lte", value: "25" })).toEqual(["2"])
  })

  it("in / nin", () => {
    expect(run({ field: "role", operator: "in", value: ["admin", "editor"] })).toEqual([
      "1",
      "2",
      "3",
    ])
    expect(run({ field: "role", operator: "nin", value: ["editor"] })).toEqual(["1"])
  })

  it("like / ilike match the whole value; substring matching needs %", () => {
    // SQL/PostgREST semantics: `%` -> `.*`, `_` -> `.`, anchored at both ends.
    expect(run({ field: "name", operator: "like", value: "Ali%" })).toEqual(["1"])
    expect(run({ field: "name", operator: "ilike", value: "ali%" })).toEqual(["1"])
    expect(run({ field: "name", operator: "ilike", value: "a" })).toEqual([])
    expect(run({ field: "name", operator: "ilike", value: "%a%" })).toEqual(["1", "3"])
  })

  it("like treats regex metacharacters as literal text", () => {
    const special: Row[] = [
      { id: "9", name: "a[b", role: "admin", age: 1, active: true, bio: null },
    ]
    expect(
      filterByConditions(special, [{ field: "name", operator: "like", value: "a[b" }]).map(
        (r) => r.id,
      ),
    ).toEqual(["9"])
    // `.*` is literal, not a wildcard: nothing matches a literal ".*" substring here.
    expect(run({ field: "name", operator: "like", value: ".*" })).toEqual([])
  })

  it("coerces boolean and numeric query strings to the field type", () => {
    expect(run({ field: "active", operator: "eq", value: "true" })).toEqual(["1", "3"])
    expect(run({ field: "active", operator: "eq", value: "false" })).toEqual(["2"])
    expect(run({ field: "age", operator: "eq", value: "30" })).toEqual(["1"])
  })

  it("null / notNull", () => {
    expect(run({ field: "bio", operator: "null", value: null })).toEqual(["2"])
    expect(run({ field: "bio", operator: "notNull", value: null })).toEqual(["1", "3"])
  })

  it("returns all items for an empty condition set", () => {
    expect(filterByConditions(rows, [])).toBe(rows)
  })
})

describe("filterByApiParams", () => {
  it("parses and applies a PostgREST-style query string", () => {
    expect(filterByApiParams(rows, "role=eq.admin").map((r) => r.id)).toEqual(["1"])
  })

  it("returns items unchanged for empty or condition-less queries", () => {
    expect(filterByApiParams(rows, "")).toBe(rows)
    expect(filterByApiParams(rows, "unknown=weird.value").map((r) => r.id)).toEqual(["1", "2", "3"])
  })
})

describe("filterBySearch", () => {
  it("matches any of the given string fields, case-insensitively", () => {
    expect(filterBySearch(rows, "car", ["name"]).map((r) => r.id)).toEqual(["3"])
    expect(filterBySearch(rows, "", ["name"])).toBe(rows)
  })
})

describe("filterByField / filterByFields", () => {
  it("matches an exact value and supports comma-separated OR", () => {
    expect(filterByField(rows, "role", "admin").map((r) => r.id)).toEqual(["1"])
    expect(filterByField(rows, "role", "admin,editor").map((r) => r.id)).toEqual(["1", "2", "3"])
  })

  it("coerces string query values to boolean and numeric field types", () => {
    expect(filterByField(rows, "active", "true").map((r) => r.id)).toEqual(["1", "3"])
    expect(filterByField(rows, "age", "25").map((r) => r.id)).toEqual(["2"])
  })

  it("returns items unchanged for empty values", () => {
    expect(filterByField(rows, "role", "")).toBe(rows)
  })

  it("applies several field filters in sequence", () => {
    expect(filterByFields(rows, { role: "editor", active: true }).map((r) => r.id)).toEqual(["3"])
  })
})

describe("facets", () => {
  it("computeFacets counts values per field", () => {
    expect(computeFacets(rows, ["role"])).toEqual({ role: { admin: 1, editor: 2 } })
  })

  it("computeFacetsWithFilters excludes each field's own conditions and adds _total", () => {
    const facets = computeFacetsWithFilters(
      rows,
      ["role"],
      [{ field: "role", operator: "eq", value: "admin" }],
    )
    expect(facets.role).toEqual({ admin: 1, editor: 2, _total: 3 })
  })
})
