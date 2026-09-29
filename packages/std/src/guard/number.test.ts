import { describe, expect, test } from "vitest"
import { isNonNegativeInteger, isPositiveInteger } from "./number"

const NOT_NUMBERS: readonly unknown[] = ["1", null, undefined, true, {}, [1], 1n]

describe("isPositiveInteger", () => {
  test("accepts safe integers of at least 1", () => {
    expect(isPositiveInteger(1)).toBe(true)
    expect(isPositiveInteger(Number.MAX_SAFE_INTEGER)).toBe(true)
  })

  test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects %s",
    (value) => {
      expect(isPositiveInteger(value)).toBe(false)
    },
  )

  test.each(NOT_NUMBERS)("rejects the non-number %s", (value) => {
    expect(isPositiveInteger(value)).toBe(false)
  })
})

describe("isNonNegativeInteger", () => {
  test("accepts zero and positive safe integers", () => {
    expect(isNonNegativeInteger(0)).toBe(true)
    expect(isNonNegativeInteger(7)).toBe(true)
  })

  test.each([-1, 0.5, Number.NaN, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects %s",
    (value) => {
      expect(isNonNegativeInteger(value)).toBe(false)
    },
  )

  test.each(NOT_NUMBERS)("rejects the non-number %s", (value) => {
    expect(isNonNegativeInteger(value)).toBe(false)
  })
})
