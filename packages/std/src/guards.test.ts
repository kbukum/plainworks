import { describe, expect, test } from "vitest"
import { hasProperty, isDefined, isNonEmptyString, isRecord } from "./guards"

describe("isDefined", () => {
  test("rejects null and undefined, accepts other values", () => {
    expect(isDefined(null)).toBe(false)
    expect(isDefined(undefined)).toBe(false)
    expect(isDefined(0)).toBe(true)
    expect(isDefined("")).toBe(true)
    expect(isDefined(false)).toBe(true)
  })
})

describe("isRecord", () => {
  test("accepts plain objects", () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord({ a: 1 })).toBe(true)
  })

  test("accepts non-array objects with a non-plain prototype", () => {
    class Decoded {
      value = 1
    }
    expect(isRecord(new Decoded())).toBe(true)
    expect(isRecord(new Date())).toBe(true)
    expect(isRecord(new Map())).toBe(true)
  })

  test("rejects arrays, null, and primitives", () => {
    expect(isRecord([])).toBe(false)
    expect(isRecord(null)).toBe(false)
    expect(isRecord("s")).toBe(false)
    expect(isRecord(3)).toBe(false)
  })
})

describe("isNonEmptyString", () => {
  test("accepts only non-empty strings", () => {
    expect(isNonEmptyString("x")).toBe(true)
    expect(isNonEmptyString("")).toBe(false)
    expect(isNonEmptyString(null)).toBe(false)
    expect(isNonEmptyString(1)).toBe(false)
  })
})

describe("hasProperty", () => {
  test("narrows an object that owns the key", () => {
    const value: unknown = { token: "abc" }
    expect(hasProperty(value, "token")).toBe(true)
    if (hasProperty(value, "token")) {
      expect(value.token).toBe("abc")
    }
  })

  test("rejects non-records and missing keys", () => {
    expect(hasProperty({ a: 1 }, "b")).toBe(false)
    expect(hasProperty(null, "a")).toBe(false)
  })

  test("rejects inherited (non-own) properties", () => {
    expect(hasProperty({}, "toString")).toBe(false)
    expect(hasProperty(Object.create({ inherited: 1 }), "inherited")).toBe(false)
  })
})
