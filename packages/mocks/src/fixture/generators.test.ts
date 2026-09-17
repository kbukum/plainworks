import type { Clock } from "@plainworks/std"
import { describe, expect, it } from "vitest"
import { daysAgo, daysFromNow, formatDate, nowISOString } from "./date"
import { generateId, generateUUID } from "./id"
import {
  createSeededRandom,
  randomBoolean,
  randomElement,
  randomElements,
  randomFloat,
  randomInt,
  randomString,
} from "./random"

const rng = () => createSeededRandom(42)
const fixedClock: Clock = { now: () => Date.parse("2026-01-15T12:00:00.000Z") }

describe("random", () => {
  it("is reproducible from the same seed", () => {
    const a = createSeededRandom(7)
    const b = createSeededRandom(7)
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()])
  })

  it("differs across seeds", () => {
    expect(createSeededRandom(1).next()).not.toBe(createSeededRandom(2).next())
  })

  it("randomInt stays within the inclusive range", () => {
    const r = rng()
    for (let i = 0; i < 100; i++) {
      const n = randomInt(r, 3, 7)
      expect(n).toBeGreaterThanOrEqual(3)
      expect(n).toBeLessThanOrEqual(7)
    }
  })

  it("randomFloat respects bounds and decimals", () => {
    const n = randomFloat(rng(), 1, 2, 3)
    expect(n).toBeGreaterThanOrEqual(1)
    expect(n).toBeLessThanOrEqual(2)
    expect(String(n).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(3)
  })

  it("randomElement returns a member and throws on empty", () => {
    expect(["a", "b"]).toContain(randomElement(rng(), ["a", "b"]))
    expect(() => randomElement(rng(), [])).toThrow(RangeError)
  })

  it("randomElement can pick a legitimate undefined element", () => {
    expect(randomElement(rng(), [undefined])).toBeUndefined()
  })

  it("randomElements returns the requested count", () => {
    expect(randomElements(rng(), [1, 2, 3, 4], 2)).toHaveLength(2)
  })

  it("randomElements rejects negative and fractional counts", () => {
    expect(() => randomElements(rng(), [1, 2, 3], -1)).toThrow(RangeError)
    expect(() => randomElements(rng(), [1, 2, 3], 1.5)).toThrow(RangeError)
  })

  it("randomBoolean honors the probability extremes", () => {
    expect(randomBoolean(rng(), 1)).toBe(true)
    expect(randomBoolean(rng(), 0)).toBe(false)
  })

  it("randomString produces the requested length", () => {
    expect(randomString(rng(), 12)).toHaveLength(12)
  })
})

describe("date", () => {
  it("nowISOString is a valid ISO timestamp", () => {
    expect(Number.isNaN(Date.parse(nowISOString(fixedClock)))).toBe(false)
  })

  it("daysAgo and daysFromNow move in opposite directions", () => {
    expect(Date.parse(daysAgo(fixedClock, 1))).toBeLessThan(fixedClock.now())
    expect(Date.parse(daysFromNow(fixedClock, 1))).toBeGreaterThan(fixedClock.now())
  })

  it("formatDate accepts strings and Date objects", () => {
    expect(formatDate("2024-01-15T00:00:00.000Z")).toContain("2024")
    expect(formatDate(new Date("2024-06-01T00:00:00.000Z"))).toContain("2024")
  })
})

describe("id", () => {
  it("generateId is unique and supports a prefix", () => {
    const a = generateId()
    const b = generateId()
    expect(a).not.toBe(b)
    expect(generateId("user")).toMatch(/^user_/)
  })

  it("generateUUID matches the v4 shape", () => {
    expect(generateUUID()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})
