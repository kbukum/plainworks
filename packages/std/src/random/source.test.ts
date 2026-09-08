import { expect, test } from "vitest"
import { createSeededRandom, systemRandom } from "./source"

test("the same seed produces the same sequence", () => {
  const a = createSeededRandom(42)
  const b = createSeededRandom(42)
  expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()])
})

test("different seeds diverge", () => {
  expect(createSeededRandom(1).next()).not.toBe(createSeededRandom(2).next())
})

// Golden vector: locks the exact mulberry32 seed→sequence mapping so an accidental algorithm change
// fails loudly instead of silently shifting every consumer's fixtures.
test("seed 42 matches the golden mulberry32 vector", () => {
  const rng = createSeededRandom(42)
  expect(rng.next()).toBe(0.60110375192016363)
  expect(rng.next()).toBe(0.44829055899754167)
  expect(rng.next()).toBe(0.85246579349040985)
})

test("next stays within the half-open range [0, 1)", () => {
  const rng = createSeededRandom(7)
  for (let i = 0; i < 1_000; i++) {
    const value = rng.next()
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThan(1)
  }
})

test("systemRandom yields floats within the half-open range [0, 1)", () => {
  for (let i = 0; i < 1_000; i++) {
    const value = systemRandom.next()
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThan(1)
  }
})
