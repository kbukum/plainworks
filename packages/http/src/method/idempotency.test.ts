import { expect, test } from "vitest"
import { IDEMPOTENCY_KEY_HEADER, withIdempotencyKey } from "./idempotency"

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
