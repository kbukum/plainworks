import { describe, expect, it } from "vitest"
import { parseApiParams } from "./api"
import { apiOperatorToFilter, OPERATOR_API } from "./operators"

describe("apiOperatorToFilter", () => {
  it("maps known wire tokens back to operators", () => {
    expect(apiOperatorToFilter("eq")).toBe("eq")
    expect(apiOperatorToFilter("is.null")).toBe("null")
    expect(apiOperatorToFilter("not.is.null")).toBe("notNull")
  })

  it("returns null for an unknown token", () => {
    expect(apiOperatorToFilter("bogus")).toBeNull()
  })

  it("exposes a token for every operator", () => {
    expect(Object.keys(OPERATOR_API)).toContain("ilike")
  })
})

describe("parseApiParams", () => {
  it("parses a simple op.value condition", () => {
    expect(parseApiParams({ status: "eq.active" })).toEqual({
      conditions: [{ field: "status", operator: "eq", value: "active" }],
    })
  })

  it("parses null checks", () => {
    expect(parseApiParams({ deletedAt: "is.null" }).conditions[0]).toEqual({
      field: "deletedAt",
      operator: "null",
      value: null,
    })
    expect(parseApiParams({ deletedAt: "not.is.null" }).conditions[0]).toEqual({
      field: "deletedAt",
      operator: "notNull",
      value: null,
    })
  })

  it("parses array values with escaped commas", () => {
    expect(parseApiParams({ role: "in.(admin,editor)" }).conditions[0]?.value).toEqual([
      "admin",
      "editor",
    ])
    expect(parseApiParams({ tag: "in.(a\\,b,c)" }).conditions[0]?.value).toEqual(["a,b", "c"])
  })

  it("unescapes parentheses and commas in scalar values", () => {
    expect(parseApiParams({ label: "eq.foo\\(bar\\)" }).conditions[0]?.value).toBe("foo(bar)")
  })

  it("skips values that are not recognised conditions", () => {
    expect(parseApiParams({ a: "novalue", b: "bogus.x" }).conditions).toEqual([])
  })
})
