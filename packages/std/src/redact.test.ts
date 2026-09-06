import { expect, test } from "vitest"
import { redact } from "./redact"

test("masks values under sensitive keys", () => {
  const result = redact({
    user: "alice",
    password: "hunter2",
    headers: { authorization: "Bearer abc.def.ghi", accept: "application/json" },
  })
  expect(result).toEqual({
    user: "alice",
    password: "[REDACTED]",
    headers: { authorization: "[REDACTED]", accept: "application/json" },
  })
})

test("masks token-shaped strings even under an innocuous key", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature"
  expect(redact({ note: jwt })).toEqual({ note: "[REDACTED]" })
  expect(redact("Bearer sometoken")).toBe("[REDACTED]")
})

test("leaves non-sensitive data intact and recurses arrays", () => {
  expect(redact({ items: [{ id: 1 }, { id: 2, secret: "s" }] })).toEqual({
    items: [{ id: 1 }, { id: 2, secret: "[REDACTED]" }],
  })
})

test("honors a custom mask and extra keys", () => {
  expect(redact({ ssn: "123" }, { keys: ["ssn"], mask: "***" })).toEqual({ ssn: "***" })
})

test("marks a cycle instead of recursing forever", () => {
  const node: Record<string, unknown> = { name: "root" }
  node.self = node
  const result = redact(node) as Record<string, unknown>
  expect(result.name).toBe("root")
  expect(result.self).toBe("[Circular]")
})

test("preserves a Date instead of erasing it to an empty object", () => {
  const when = new Date("2024-01-02T03:04:05.000Z")
  const result = redact({ createdAt: when }) as { createdAt: Date }
  expect(result.createdAt).toBeInstanceOf(Date)
  expect(result.createdAt.getTime()).toBe(when.getTime())
})

test("clones a Date through the intrinsic getter so a toJSON hook cannot ride along", () => {
  const when = new Date("2024-01-02T03:04:05.000Z")
  // An own `toJSON` on the Date would otherwise survive and run inside a JSON log sink.
  Object.defineProperty(when, "toJSON", {
    enumerable: true,
    value: () => "******",
  })
  const result = redact({ createdAt: when }) as { createdAt: Date }
  expect(result.createdAt).toBeInstanceOf(Date)
  expect(result.createdAt.getTime()).toBe(when.getTime())
  expect(JSON.parse(JSON.stringify(result)).createdAt).toBe("2024-01-02T03:04:05.000Z")
})

test("does not execute an indexed array accessor on an untrusted payload", () => {
  let invoked = false
  const payload: unknown[] = []
  Object.defineProperty(payload, 0, {
    enumerable: true,
    get() {
      invoked = true
      return "computed"
    },
  })
  expect(redact({ items: payload })).toEqual({ items: ["[Getter]"] })
  expect(invoked).toBe(false)
})

test("truncates beyond the max depth", () => {
  expect(redact({ a: { b: { c: 1 } } }, { maxDepth: 1 })).toEqual({ a: "[Truncated]" })
})

test("matches sensitive keys across separator styles", () => {
  expect(redact({ "x-api-key": "k", "private-key": "p", "Set-Cookie": "c" })).toEqual({
    "x-api-key": "[REDACTED]",
    "private-key": "[REDACTED]",
    "Set-Cookie": "[REDACTED]",
  })
  expect(redact({ "x-custom-secret": "v" }, { keys: ["custom_secret"] })).toEqual({
    "x-custom-secret": "[REDACTED]",
  })
})

test("masks a sensitive accessor without invoking its getter", () => {
  let invoked = false
  const payload = {} as Record<string, unknown>
  Object.defineProperty(payload, "authorization", {
    enumerable: true,
    get() {
      invoked = true
      throw new Error("getter should never run on a sensitive key")
    },
  })
  expect(redact(payload)).toEqual({ authorization: "[REDACTED]" })
  expect(invoked).toBe(false)
})

test("does not execute a non-sensitive getter on an untrusted payload", () => {
  let invoked = false
  const payload = {} as Record<string, unknown>
  Object.defineProperty(payload, "meta", {
    enumerable: true,
    get() {
      invoked = true
      return "computed"
    },
  })
  expect(redact(payload)).toEqual({ meta: "[Getter]" })
  expect(invoked).toBe(false)
})

test("rejects a non-integer or negative maxDepth", () => {
  expect(() => redact({ a: 1 }, { maxDepth: Number.NaN })).toThrow(RangeError)
  expect(() => redact({ a: 1 }, { maxDepth: -1 })).toThrow(RangeError)
  expect(() => redact({ a: 1 }, { maxDepth: 1.5 })).toThrow(RangeError)
})

test("inerts a callable value so a surviving toJSON hook cannot re-emit a secret", () => {
  const payload = {
    label: "safe",
    toJSON() {
      return "******"
    },
  }
  const result = redact(payload) as Record<string, unknown>
  expect(result).toEqual({ label: "safe", toJSON: "[Function]" })
  // The redacted copy carries no executable hook, so JSON serialization cannot run it.
  expect(JSON.parse(JSON.stringify(result))).toEqual({ label: "safe", toJSON: "[Function]" })
  expect(redact(() => "******")).toBe("[Function]")
})
