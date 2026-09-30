import { expect, test } from "vitest"
import { seededRandom } from "./random"

test("the same seed produces the same sequence", () => {
  const a = seededRandom(42)
  const b = seededRandom(42)
  const seqA = [a.next(), a.next(), a.next()]
  const seqB = [b.next(), b.next(), b.next()]
  expect(seqA).toEqual(seqB)
})

test("different seeds diverge", () => {
  const a = seededRandom(1)
  const b = seededRandom(2)
  expect(a.next()).not.toBe(b.next())
})

test("next stays within the half-open range [0, 1)", () => {
  const rng = seededRandom(7)
  for (let i = 0; i < 1_000; i++) {
    const value = rng.next()
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThan(1)
  }
})

test("int stays within the inclusive bounds", () => {
  const rng = seededRandom(99)
  for (let i = 0; i < 1_000; i++) {
    const value = rng.int(3, 6)
    expect(value).toBeGreaterThanOrEqual(3)
    expect(value).toBeLessThanOrEqual(6)
    expect(Number.isInteger(value)).toBe(true)
  }
})

test("int rejects an inverted range", () => {
  const rng = seededRandom(1)
  expect(() => rng.int(5, 1)).toThrow(RangeError)
})

test("int rejects fractional and non-finite bounds", () => {
  const rng = seededRandom(1)
  expect(() => rng.int(0.5, 2)).toThrow(RangeError)
  expect(() => rng.int(0, Number.NaN)).toThrow(RangeError)
  expect(() => rng.int(0, Number.POSITIVE_INFINITY)).toThrow(RangeError)
})

test("pick returns a member of the array", () => {
  const rng = seededRandom(123)
  const items = ["a", "b", "c"] as const
  for (let i = 0; i < 100; i++) {
    expect(items).toContain(rng.pick(items))
  }
})

test("pick can return a legitimate undefined element", () => {
  expect(seededRandom(1).pick([undefined])).toBeUndefined()
})

test("pick rejects an empty array", () => {
  const rng = seededRandom(1)
  expect(() => rng.pick([])).toThrow(RangeError)
})
