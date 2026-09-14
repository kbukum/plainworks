import { describe, expect, it } from "vitest"
import { buildFilter, encodeListValues, type FilterFieldDef, parseListValues } from "./filter-model"

const textField: FilterFieldDef = { field: "city", label: "City", type: "text" }
const numberField: FilterFieldDef = { field: "price", label: "Price", type: "number" }

describe("buildFilter", () => {
  it("drops the value for a presence operator", () => {
    expect(buildFilter(textField, "null", "ignored")).toEqual({ field: "city", op: "null" })
  })

  it("coerces a numeric scalar to a finite number", () => {
    expect(buildFilter(numberField, "gt", "42")).toEqual({ field: "price", op: "gt", value: 42 })
  })

  it("keeps a non-numeric scalar as a string so the editor still round-trips", () => {
    expect(buildFilter(numberField, "gt", "")).toEqual({ field: "price", op: "gt", value: "" })
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
