import { err, ok, PlainError } from "@plainworks/std"
import { expect, test } from "vitest"
import { expectErr, expectOk } from "./result"

test("expectOk returns the value of an Ok", () => {
  expect(expectOk(ok(42))).toBe(42)
})

test("expectOk throws a typed PlainError on an Err, preserving cause", () => {
  const cause = new Error("boom")
  try {
    expectOk(err(cause))
    throw new Error("should have thrown")
  } catch (thrown) {
    expect(thrown).toBeInstanceOf(PlainError)
    expect((thrown as PlainError).kind).toBe("testkit/expect-ok")
    expect((thrown as PlainError).cause).toBe(cause)
  }
})

test("expectErr returns the error of an Err", () => {
  const cause = new Error("nope")
  expect(expectErr(err(cause))).toBe(cause)
})

test("expectErr throws a typed PlainError on an Ok", () => {
  try {
    expectErr(ok("value"))
    throw new Error("should have thrown")
  } catch (thrown) {
    expect(thrown).toBeInstanceOf(PlainError)
    expect((thrown as PlainError).kind).toBe("testkit/expect-err")
  }
})

test("expectErr does not serialize the Ok value (bigint, circular)", () => {
  expect(() => expectErr(ok(10n))).toThrow(PlainError)
  const circular: Record<string, unknown> = {}
  circular.self = circular
  expect(() => expectErr(ok(circular))).toThrow(PlainError)
})
