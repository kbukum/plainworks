import { expect, test } from "vitest"
import { HttpError, isHttpError } from "./error"

test("status maps a 5xx to a retryable transport failure", () => {
  const error = HttpError.status(503)
  expect(error.kind).toBe("http/status")
  expect(error.status).toBe(503)
  expect(error.category).toBe("transport")
  expect(error.retryable).toBe(true)
  expect(error.name).toBe("HttpError")
})

test("status maps a 401 to a fatal auth failure and carries a Retry-After hint", () => {
  const cause = new Error("unauthorized")
  const error = HttpError.status(401, { retryAfterMs: 2000, cause })
  expect(error.category).toBe("auth")
  expect(error.retryable).toBe(false)
  expect(error.retryAfterMs).toBe(2000)
  expect(error.cause).toBe(cause)
})

test("status maps a plain 404 to a fatal protocol failure with no hint", () => {
  const error = HttpError.status(404)
  expect(error.category).toBe("protocol")
  expect(error.retryable).toBe(false)
  expect(error.retryAfterMs).toBeUndefined()
})

test("network is a retryable failure with no status", () => {
  const error = HttpError.network({ cause: new Error("boom") })
  expect(error.kind).toBe("http/network")
  expect(error.status).toBeUndefined()
  expect(error.category).toBe("network")
  expect(error.retryable).toBe(true)
})

test("timeout is a retryable timeout failure that preserves its cause", () => {
  const cause = new Error("deadline")
  const error = HttpError.timeout({ cause })
  expect(error.kind).toBe("http/timeout")
  expect(error.status).toBeUndefined()
  expect(error.category).toBe("timeout")
  expect(error.retryable).toBe(true)
  expect(error.cause).toBe(cause)
})

test("request is a fatal protocol failure for a malformed request", () => {
  const error = HttpError.request("A GET request must not carry a body.")
  expect(error.kind).toBe("http/request")
  expect(error.category).toBe("protocol")
  expect(error.retryable).toBe(false)
})

test("unsafeUrl and decode are fatal protocol failures", () => {
  const unsafe = HttpError.unsafeUrl("nope")
  expect(unsafe.kind).toBe("http/unsafe-url")
  expect(unsafe.retryable).toBe(false)
  const decode = HttpError.decode({ cause: new SyntaxError("bad") })
  expect(decode.kind).toBe("http/decode")
  expect(decode.retryable).toBe(false)
})

test("encode is a fatal protocol failure that preserves its cause", () => {
  const cause = new TypeError("Converting circular structure to JSON")
  const error = HttpError.encode({ cause })
  expect(error.kind).toBe("http/encode")
  expect(error.category).toBe("protocol")
  expect(error.retryable).toBe(false)
  expect(error.cause).toBe(cause)
})

test("isHttpError narrows only HttpError instances", () => {
  expect(isHttpError(HttpError.network())).toBe(true)
  expect(isHttpError(new Error("x"))).toBe(false)
  expect(isHttpError("http")).toBe(false)
})

test("validate is a fatal protocol failure that preserves the issues as cause", () => {
  const issues = [{ message: "id must be a number" }]
  const error = HttpError.validate(issues)
  expect(error.kind).toBe("http/validate")
  expect(error.category).toBe("protocol")
  expect(error.retryable).toBe(false)
  expect(error.cause).toBe(issues)
  expect(error.message).toContain("id must be a number")
})

test("validate summarizes a keyed issue path and counts the remaining issues", () => {
  const error = HttpError.validate([
    { message: "expected string", path: ["items", 0, { key: "name" }] },
    { message: "expected number", path: ["total"] },
  ])
  expect(error.message).toContain("items.0.name: expected string")
  expect(error.message).toContain("(+1 more)")
})

test("validate degrades to a generic message when there are no issues", () => {
  const error = HttpError.validate([])
  expect(error.message).toContain("unknown validation error")
  expect(error.cause).toEqual([])
})

test("validate prefers an explicit cause over the issues", () => {
  const cause = new Error("root")
  const error = HttpError.validate([{ message: "bad" }], { cause })
  expect(error.cause).toBe(cause)
})
