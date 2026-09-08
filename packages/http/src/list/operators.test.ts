import type { FilterOperator } from "@plainworks/std"
import { describe, expect, it } from "vitest"
import {
  FILTER_OPERATOR_TOKENS,
  FILTER_OPERATOR_TOKENS_LONGEST_FIRST,
  filterOperatorFromToken,
  splitOperatorToken,
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

describe("splitOperatorToken", () => {
  it("splits `op.value` into the longest known token and the remaining value", () => {
    expect(splitOperatorToken("eq.active")).toEqual({ token: "eq", rest: "active" })
    expect(splitOperatorToken("in.(a,b,c)")).toEqual({ token: "in", rest: "(a,b,c)" })
  })

  it("matches a multi-segment token before its shorter prefix", () => {
    expect(splitOperatorToken("not.in.(a,b)")).toEqual({ token: "not.in", rest: "(a,b)" })
    expect(splitOperatorToken("not.is.null")).toEqual({ token: "not.is.null", rest: "" })
    expect(splitOperatorToken("is.null")).toEqual({ token: "is.null", rest: "" })
  })

  it("returns null when no known token prefixes the value", () => {
    expect(splitOperatorToken("novalue")).toBeNull()
    expect(splitOperatorToken("bogus.x")).toBeNull()
  })
})
