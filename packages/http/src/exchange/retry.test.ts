import { NetworkError, type RetryPolicy } from "@plainworks/std"
import { expect, test } from "vitest"
import { HttpError } from "../error"
import { isHttpRetryable, parseRetryAfterMs, resolveRetryPolicy, retryAfterOf } from "./retry"

const backoff = { baseMs: 10, maxMs: 100, factor: 2, jitter: "none" } as const
const base: RetryPolicy = { maxAttempts: 3, backoff, idempotent: true }

test("isHttpRetryable defers to an HttpError's own verdict, else the shared classifier", () => {
  expect(isHttpRetryable(HttpError.status(503))).toBe(true)
  expect(isHttpRetryable(HttpError.status(401))).toBe(false)
  expect(isHttpRetryable(new NetworkError("down"))).toBe(true)
  expect(isHttpRetryable(new Error("mystery"))).toBe(false)
})

test("retryAfterOf reads the hint only from an HttpError", () => {
  expect(retryAfterOf(HttpError.status(429, { retryAfterMs: 1500 }))).toBe(1500)
  expect(retryAfterOf(new Error("x"))).toBeUndefined()
})

test("resolveRetryPolicy returns undefined when no base policy is configured", () => {
  expect(resolveRetryPolicy(undefined, "GET", undefined)).toBeUndefined()
})

test("resolveRetryPolicy derives idempotency from the method", () => {
  expect(resolveRetryPolicy(base, "GET", undefined)?.idempotent).toBe(true)
  expect(resolveRetryPolicy(base, "POST", undefined)?.idempotent).toBe(false)
})

test("resolveRetryPolicy honors an explicit per-request idempotency override", () => {
  expect(resolveRetryPolicy(base, "POST", true)?.idempotent).toBe(true)
  expect(resolveRetryPolicy(base, "GET", false)?.idempotent).toBe(false)
})

test("resolveRetryPolicy wires the http classifier and hint reader by default", () => {
  const resolved = resolveRetryPolicy(base, "GET", undefined)
  expect(resolved?.isRetryable?.(HttpError.status(503))).toBe(true)
  expect(resolved?.retryAfter?.(HttpError.status(429, { retryAfterMs: 900 }))).toBe(900)
})

test("resolveRetryPolicy preserves a caller's custom classifier and hint reader", () => {
  const custom: RetryPolicy = {
    ...base,
    isRetryable: () => false,
    retryAfter: () => 42,
  }
  const resolved = resolveRetryPolicy(custom, "GET", undefined)
  expect(resolved?.isRetryable?.(HttpError.status(503))).toBe(false)
  expect(resolved?.retryAfter?.(new Error("x"))).toBe(42)
})

test("parseRetryAfterMs reads integer seconds", () => {
  expect(parseRetryAfterMs("2", 0)).toBe(2000)
})

test("parseRetryAfterMs reads an HTTP date as a delay from now, clamped at zero", () => {
  const now = Date.parse("2026-01-01T00:00:00Z")
  expect(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:05 GMT", now)).toBe(5000)
  expect(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:00 GMT", now + 10_000)).toBe(0)
})

test("parseRetryAfterMs ignores an absent, empty, or unparseable value", () => {
  expect(parseRetryAfterMs(null, 0)).toBeUndefined()
  expect(parseRetryAfterMs("   ", 0)).toBeUndefined()
  expect(parseRetryAfterMs("soon", 0)).toBeUndefined()
})
