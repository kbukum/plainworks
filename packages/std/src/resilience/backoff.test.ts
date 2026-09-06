import { expect, test } from "vitest"
import { createSeededRandom } from "../random"
import { type BackoffPolicy, defaultBackoff, type JitterStrategy, nextBackoff } from "./backoff"

const exponential: BackoffPolicy = { baseMs: 100, maxMs: 10_000, factor: 2, jitter: "none" }

test("bare exponential doubles each attempt and clamps at maxMs", () => {
  expect(nextBackoff(exponential, 0)).toBe(100)
  expect(nextBackoff(exponential, 1)).toBe(200)
  expect(nextBackoff(exponential, 2)).toBe(400)
  expect(nextBackoff({ ...exponential, maxMs: 300 }, 5)).toBe(300)
})

test("full jitter stays within [0, cap] and is seed-reproducible", () => {
  const policy: BackoffPolicy = { ...exponential, jitter: "full" }
  const cap = 400
  for (let attempt = 0; attempt < 50; attempt++) {
    const delay = nextBackoff(policy, 2, createSeededRandom(attempt))
    expect(delay).toBeGreaterThanOrEqual(0)
    expect(delay).toBeLessThanOrEqual(cap)
  }
  expect(nextBackoff(policy, 2, createSeededRandom(7))).toBe(
    nextBackoff(policy, 2, createSeededRandom(7)),
  )
})

test("decorrelated jitter never exceeds maxMs and stays at least baseMs", () => {
  const policy: BackoffPolicy = { baseMs: 100, maxMs: 2_000, factor: 2, jitter: "decorrelated" }
  let previous = policy.baseMs
  const rng = createSeededRandom(1)
  for (let i = 0; i < 100; i++) {
    const delay = nextBackoff(policy, i, rng, previous)
    expect(delay).toBeGreaterThanOrEqual(policy.baseMs)
    expect(delay).toBeLessThanOrEqual(policy.maxMs)
    previous = delay
  }
})

test("an invalid policy or attempt is rejected", () => {
  expect(() => nextBackoff({ ...exponential, maxMs: 10 }, 0)).toThrow(RangeError)
  expect(() => nextBackoff(exponential, -1)).toThrow(RangeError)
  expect(() => nextBackoff(exponential, 1.5)).toThrow(RangeError)
})

test("non-finite policy values are rejected", () => {
  expect(() => nextBackoff({ ...exponential, baseMs: Number.NaN }, 0)).toThrow(RangeError)
  expect(() => nextBackoff({ ...exponential, maxMs: Number.POSITIVE_INFINITY }, 0)).toThrow(
    RangeError,
  )
  expect(() => nextBackoff({ ...exponential, factor: Number.NaN }, 0)).toThrow(RangeError)
})

test("an unsupported jitter strategy is rejected", () => {
  expect(() => nextBackoff({ ...exponential, jitter: "wild" as JitterStrategy }, 0)).toThrow(
    RangeError,
  )
})

test("a non-finite previousMs is rejected", () => {
  const policy: BackoffPolicy = { ...exponential, jitter: "decorrelated" }
  expect(() => nextBackoff(policy, 1, createSeededRandom(1), Number.NaN)).toThrow(RangeError)
  expect(() => nextBackoff(policy, 1, createSeededRandom(1), Number.POSITIVE_INFINITY)).toThrow(
    RangeError,
  )
})

test("defaultBackoff is a sane, bounded schedule", () => {
  expect(defaultBackoff.baseMs).toBeGreaterThan(0)
  expect(defaultBackoff.maxMs).toBeGreaterThanOrEqual(defaultBackoff.baseMs)
})

test("a zero-base schedule stays finite even when the power overflows", () => {
  const policy: BackoffPolicy = { baseMs: 0, maxMs: 10_000, factor: 2, jitter: "none" }
  const delay = nextBackoff(policy, 5_000)
  expect(Number.isFinite(delay)).toBe(true)
  expect(delay).toBe(0)
})

test("decorrelated jitter stays finite for an enormous previousMs and a zero random draw", () => {
  const policy: BackoffPolicy = { baseMs: 100, maxMs: 2_000, factor: 2, jitter: "decorrelated" }
  const zeroRandom = { next: () => 0 }
  const delay = nextBackoff(policy, 0, zeroRandom, Number.MAX_VALUE)
  expect(Number.isFinite(delay)).toBe(true)
  expect(delay).toBeGreaterThanOrEqual(policy.baseMs)
  expect(delay).toBeLessThanOrEqual(policy.maxMs)
})
