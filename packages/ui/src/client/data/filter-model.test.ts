import type { ListFilter } from "@plainworks/std/list"
import { describe, expect, it } from "vitest"
import {
  buildFilter,
  carryFilterValue,
  encodeListValues,
  type FilterFieldDef,
  filterSetsEqual,
  parseListValues,
  rangeBound,
  selectedFacetValues,
  toggleFacetValue,
  withFilterField,
  withFilterOperator,
  withRangeBound,
} from "./filter-model"

const textField: FilterFieldDef = { field: "city", label: "City", type: "text" }
const numberField: FilterFieldDef = { field: "price", label: "Price", type: "number" }

describe("buildFilter", () => {
  it("drops the value for a presence operator", () => {
    expect(buildFilter(textField, "null", "ignored")).toEqual({ field: "city", op: "null" })
  })

  it("coerces a numeric scalar to a finite number", () => {
    expect(buildFilter(numberField, "gt", "42")).toEqual({ field: "price", op: "gt", value: 42 })
  })

  it("leaves a numeric field empty rather than carrying text the number editor cannot show", () => {
    expect(buildFilter(numberField, "gt", "")).toEqual({ field: "price", op: "gt", value: "" })
    expect(buildFilter(numberField, "gt", "abc")).toEqual({ field: "price", op: "gt", value: "" })
    expect(buildFilter(numberField, "in", "5\nabc")).toEqual({
      field: "price",
      op: "in",
      value: [5],
    })
  })
})

describe("list value round-trip", () => {
  it("preserves values containing commas (one value per line, not a comma split)", () => {
    const values = ["New York, NY", "Los Angeles, CA"]
    const filter = buildFilter(textField, "in", encodeListValues(values))
    expect(filter).toEqual({ field: "city", op: "in", value: values })
  })

  it("drops blank lines and trims each value", () => {
    expect(parseListValues("a\n \n  b  \n")).toEqual(["a", "b"])
  })

  it("round-trips through encode/parse", () => {
    const values = ["a,b", "c", "d, e, f"]
    expect(parseListValues(encodeListValues(values))).toEqual(values)
  })
})

describe("carryFilterValue", () => {
  it("drops the value for a presence target", () => {
    expect(carryFilterValue({ field: "city", op: "eq", value: "Oslo" }, "null")).toBe("")
  })

  it("keeps only the first value when a list operator becomes a scalar", () => {
    expect(carryFilterValue({ field: "city", op: "in", value: ["Oslo", "Rome"] }, "eq")).toBe(
      "Oslo",
    )
  })

  it("carries a scalar through unchanged", () => {
    expect(carryFilterValue({ field: "price", op: "gt", value: 5 }, "lt")).toBe("5")
  })
})

describe("withFilterField / withFilterOperator", () => {
  it("keeps an unknown field and operator selectable, in front", () => {
    expect(withFilterField([textField], "zip").map((def) => def.field)).toEqual(["zip", "city"])
    expect(withFilterField([textField], "city")).toEqual([textField])
    expect(withFilterOperator(["eq", "neq"], "like")).toEqual(["like", "eq", "neq"])
    expect(withFilterOperator(["eq", "neq"], "eq")).toEqual(["eq", "neq"])
  })
})

describe("filterSetsEqual", () => {
  it("compares field, operator and value, including lists and presence", () => {
    const a: ListFilter[] = [
      { field: "city", op: "in", value: ["a", "b"] },
      { field: "zip", op: "null" },
    ]
    expect(filterSetsEqual(a, [...a])).toBe(true)
    expect(
      filterSetsEqual(a, [{ field: "city", op: "in", value: ["a"] }, a[1] as ListFilter]),
    ).toBe(false)
    expect(filterSetsEqual(a, a.slice(0, 1))).toBe(false)
    expect(
      filterSetsEqual([{ field: "zip", op: "null" }], [{ field: "zip", op: "eq", value: "1" }]),
    ).toBe(false)
  })
})

describe("facet filters", () => {
  it("reads the selected values of a field's `in` filter", () => {
    const filters: ListFilter[] = [{ field: "role", op: "in", value: ["admin", "viewer"] }]
    expect(selectedFacetValues(filters, "role")).toEqual(["admin", "viewer"])
    expect(selectedFacetValues(filters, "status")).toEqual([])
  })

  it("adds and removes one value, dropping the filter when none remain", () => {
    const other: ListFilter = { field: "status", op: "in", value: ["active"] }
    const once = toggleFacetValue([other], "role", "admin", true)
    expect(once).toEqual([other, { field: "role", op: "in", value: ["admin"] }])
    expect(toggleFacetValue(once, "role", "admin", false)).toEqual([other])
  })

  it("never duplicates a value and keeps the field's other filters", () => {
    const bound: ListFilter = { field: "price", op: "gte", value: 10 }
    const selected: ListFilter = { field: "price", op: "in", value: [20] }
    const again = toggleFacetValue([bound, selected], "price", "20", true)
    expect(again).toEqual([bound, { field: "price", op: "in", value: ["20"] }])
    expect(toggleFacetValue(again, "price", "20", false)).toEqual([bound])
  })
})

describe("range filters", () => {
  it("reads and writes each bound, clearing it on null", () => {
    const set = withRangeBound(withRangeBound([], "price", "gte", 10), "price", "lte", 50)
    expect(rangeBound(set, "price", "gte")).toBe(10)
    expect(rangeBound(set, "price", "lte")).toBe(50)
    const cleared = withRangeBound(set, "price", "gte", null)
    expect(rangeBound(cleared, "price", "gte")).toBeNull()
    expect(cleared).toEqual([{ field: "price", op: "lte", value: 50 }])
  })

  it("replaces a bound instead of stacking a second one", () => {
    const set = withRangeBound(withRangeBound([], "price", "gte", 10), "price", "gte", 20)
    expect(set).toEqual([{ field: "price", op: "gte", value: 20 }])
  })
})
