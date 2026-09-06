import { describe, expect, test } from "vitest"
import { assert, assertNever } from "./assert"
import { PlainError } from "./errors"

describe("assert", () => {
  test("passes through when the condition is truthy", () => {
    expect(() => assert(1, "should not throw")).not.toThrow()
  })

  test("throws a PlainError when the condition is falsy", () => {
    expect(() => assert(0, "must be set")).toThrow(PlainError)
    expect(() => assert(false, "must be set")).toThrow("must be set")
  })

  test("narrows the asserted value for the type checker", () => {
    const value: string | undefined = "here"
    assert(value !== undefined, "value is required")
    expect(value.length).toBe(4)
  })
})

describe("assertNever", () => {
  test("throws with the unexpected value in the message", () => {
    // Cast through unknown: the whole point is an unreachable branch reached at runtime.
    const unreachable = "surprise" as unknown as never
    expect(() => assertNever(unreachable)).toThrow(PlainError)
    expect(() => assertNever(unreachable)).toThrow(/surprise/)
  })
})
