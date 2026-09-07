import { expect, test } from "vitest"
import { isIdempotentMethod } from "./method"

test("GET, HEAD, PUT, DELETE, OPTIONS are idempotent", () => {
  for (const method of ["GET", "HEAD", "PUT", "DELETE", "OPTIONS"] as const) {
    expect(isIdempotentMethod(method)).toBe(true)
  }
})

test("POST and PATCH are not idempotent", () => {
  expect(isIdempotentMethod("POST")).toBe(false)
  expect(isIdempotentMethod("PATCH")).toBe(false)
})
