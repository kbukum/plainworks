import { describe, expect, test } from "vitest"
import { isStructurallyEqual } from "./equality"

describe("isStructurallyEqual", () => {
  test("compares primitives with Object.is", () => {
    expect(isStructurallyEqual(1, 1)).toBe(true)
    expect(isStructurallyEqual(Number.NaN, Number.NaN)).toBe(true)
    expect(isStructurallyEqual(0, -0)).toBe(false)
    expect(isStructurallyEqual("1", 1)).toBe(false)
    expect(isStructurallyEqual(null, undefined)).toBe(false)
  })

  test("compares arrays item by item, including length", () => {
    expect(isStructurallyEqual(["users", { id: 1 }], ["users", { id: 1 }])).toBe(true)
    expect(isStructurallyEqual(["users"], ["users", 1])).toBe(false)
    expect(isStructurallyEqual([1, 2], [2, 1])).toBe(false)
  })

  test("compares plain records by every field, ignoring field order", () => {
    expect(isStructurallyEqual({ a: 1, b: [2] }, { b: [2], a: 1 })).toBe(true)
    expect(isStructurallyEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(isStructurallyEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false)
    expect(isStructurallyEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false)
  })

  test("never equates records whose field names differ, even with undefined values", () => {
    expect(isStructurallyEqual({ a: undefined }, { b: undefined })).toBe(false)
    expect(isStructurallyEqual({ a: undefined }, { a: undefined })).toBe(true)
  })

  test("never treats an array and a record as equal", () => {
    expect(isStructurallyEqual([], {})).toBe(false)
    expect(isStructurallyEqual({ 0: "a", length: 1 }, ["a"])).toBe(false)
  })
})
