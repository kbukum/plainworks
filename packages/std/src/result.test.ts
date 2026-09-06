import { describe, expect, test } from "vitest"
import { PlainError } from "./errors"
import { err, isErr, isOk, ok, type Result, unwrap, unwrapOr } from "./result"

describe("Result constructors", () => {
  test("ok wraps a value in a success result", () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 })
  })

  test("err wraps an error in a failure result", () => {
    const error = new Error("nope")
    expect(err(error)).toEqual({ ok: false, error })
  })
})

describe("Result guards", () => {
  test("isOk narrows to the success branch", () => {
    const result: Result<number> = ok(5)
    expect(isOk(result)).toBe(true)
    expect(isErr(result)).toBe(false)
    if (isOk(result)) {
      expect(result.value).toBe(5)
    }
  })

  test("isErr narrows to the failure branch", () => {
    const result: Result<number> = err(new Error("bad"))
    expect(isErr(result)).toBe(true)
    expect(isOk(result)).toBe(false)
    if (isErr(result)) {
      expect(result.error.message).toBe("bad")
    }
  })
})

describe("unwrap", () => {
  test("returns the value of an Ok", () => {
    expect(unwrap(ok("value"))).toBe("value")
  })

  test("throws the underlying Error of an Err", () => {
    const error = new Error("explode")
    expect(() => unwrap(err(error))).toThrow(error)
  })

  test("wraps a non-Error failure in a PlainError", () => {
    expect(() => unwrap(err("string failure"))).toThrow(PlainError)
  })
})

describe("unwrapOr", () => {
  test("returns the value of an Ok", () => {
    expect(unwrapOr(ok(1), 0)).toBe(1)
  })

  test("returns the fallback of an Err", () => {
    const failure: Result<number> = err(new Error("x"))
    expect(unwrapOr(failure, 0)).toBe(0)
  })
})
