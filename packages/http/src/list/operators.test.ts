import { describe, expect, it } from "vitest"
import {
  FILTER_OPERATOR_TOKENS,
  FILTER_OPERATOR_TOKENS_LONGEST_FIRST,
  type FilterOperator,
  filterOperatorFromToken,
} from "./operators"

describe("FILTER_OPERATOR_TOKENS", () => {
  it("maps every operator to its PostgREST wire token", () => {
    expect(FILTER_OPERATOR_TOKENS).toEqual({
      eq: "eq",
      neq: "neq",
      gt: "gt",
      gte: "gte",
      lt: "lt",
      lte: "lte",
      like: "like",
      ilike: "ilike",
      in: "in",
      nin: "not.in",
      null: "is.null",
      notNull: "not.is.null",
    })
  })

  it("lists tokens longest-first so multi-segment tokens match before their prefixes", () => {
    const notNull = FILTER_OPERATOR_TOKENS_LONGEST_FIRST.indexOf("not.is.null")
    const notIn = FILTER_OPERATOR_TOKENS_LONGEST_FIRST.indexOf("not.in")
    const isNull = FILTER_OPERATOR_TOKENS_LONGEST_FIRST.indexOf("is.null")
    const inIndex = FILTER_OPERATOR_TOKENS_LONGEST_FIRST.indexOf("in")
    expect(notNull).toBeGreaterThanOrEqual(0)
    expect(notNull).toBeLessThan(isNull)
    expect(notIn).toBeLessThan(inIndex)
  })
})

describe("filterOperatorFromToken", () => {
  it("resolves every emitted token back to its operator", () => {
    for (const [operator, token] of Object.entries(FILTER_OPERATOR_TOKENS)) {
      expect(filterOperatorFromToken(token)).toBe(operator as FilterOperator)
    }
  })

  it("returns null for an unknown token", () => {
    expect(filterOperatorFromToken("bogus")).toBeNull()
  })
})
