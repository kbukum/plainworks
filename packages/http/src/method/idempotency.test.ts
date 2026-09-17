import { expect, test } from "vitest"
import { IDEMPOTENCY_KEY_HEADER, isIdempotentMethod, withIdempotencyKey } from "./idempotency"

test("GET, HEAD, PUT, DELETE, OPTIONS are idempotent", () => {
  for (const method of ["GET", "HEAD", "PUT", "DELETE", "OPTIONS"] as const) {
    expect(isIdempotentMethod(method)).toBe(true)
  }
})

test("POST and PATCH are not idempotent", () => {
  expect(isIdempotentMethod("POST")).toBe(false)
  expect(isIdempotentMethod("PATCH")).toBe(false)
})

test("sets the idempotency-key header on an empty header set", () => {
  const headers = withIdempotencyKey(undefined, "key-1")

  expect(headers.get(IDEMPOTENCY_KEY_HEADER)).toBe("key-1")
})

test("merges the key alongside existing headers without dropping them", () => {
  const headers = withIdempotencyKey({ "x-trace": "abc" }, "key-2")

  expect(headers.get("x-trace")).toBe("abc")
  expect(headers.get(IDEMPOTENCY_KEY_HEADER)).toBe("key-2")
})

test("does not mutate a caller-supplied Headers instance", () => {
  const original = new Headers({ "x-trace": "abc" })

  const merged = withIdempotencyKey(original, "key-3")

  expect(original.get(IDEMPOTENCY_KEY_HEADER)).toBeNull()
  expect(merged.get(IDEMPOTENCY_KEY_HEADER)).toBe("key-3")
})
