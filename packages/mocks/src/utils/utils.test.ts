import type { Clock } from "@plainworks/std"
import { afterEach, describe, expect, it, vi } from "vitest"
import { applyFieldSelection } from "./applyFieldSelection"
import { daysAgo, daysFromNow, formatDate, nowISOString } from "./date"
import { createLatency } from "./delay"
import { generateId, generateUUID } from "./id"
import { paginate } from "./pagination"
import {
  createSeededRandom,
  randomBoolean,
  randomElement,
  randomElements,
  randomFloat,
  randomInt,
  randomString,
} from "./random"
import { sortBy } from "./sorting"

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

describe("paginate", () => {
  const items = Array.from({ length: 25 }, (_, i) => i)

  it("slices by page and limit", () => {
    const result = paginate(items, { page: 2, limit: 10 })
    expect(result.data).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    expect(result.pagination).toEqual({ page: 2, pageSize: 10, total: 25, totalPages: 3 })
  })

  it("supports pageSize alias and defaults", () => {
    expect(paginate(items).pagination.pageSize).toBe(10)
    expect(paginate(items, { pageSize: 5 }).pagination.pageSize).toBe(5)
  })
})

describe("sortBy", () => {
  const rows = [
    { n: 3, s: "c" },
    { n: 1, s: "a" },
    { n: 2, s: "b" },
  ]

  it("returns items unchanged without a field", () => {
    expect(sortBy(rows)).toBe(rows)
  })

  it("sorts numbers ascending and descending", () => {
    expect(sortBy(rows, { field: "n" }).map((r) => r.n)).toEqual([1, 2, 3])
    expect(sortBy(rows, { field: "n", order: "desc" }).map((r) => r.n)).toEqual([3, 2, 1])
  })

  it("sorts strings lexically", () => {
    expect(sortBy(rows, { field: "s" }).map((r) => r.s)).toEqual(["a", "b", "c"])
  })

  it("pushes null and undefined to the end", () => {
    const withGaps = [{ v: 2 }, { v: null }, { v: 1 }]
    expect(sortBy(withGaps, { field: "v" }).map((r) => r.v)).toEqual([1, 2, null])
  })
})

describe("applyFieldSelection", () => {
  const items = [{ id: "1", name: "a", email: "e" }]

  it("returns items unchanged when no fields requested", () => {
    expect(applyFieldSelection(items, undefined)).toBe(items)
    expect(applyFieldSelection(items, " , ")).toBe(items)
  })

  it("keeps only the selected, existing fields", () => {
    expect(applyFieldSelection(items, "id, name, missing")).toEqual([{ id: "1", name: "a" }])
  })
})

describe("latency", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("is disabled by default and clamps negative values", async () => {
    const latency = createLatency()
    expect(latency.get()).toBe(0)
    await expect(latency.wait()).resolves.toBeUndefined()

    latency.set(-5)
    expect(latency.get()).toBe(0)
  })

  it("waits for the configured fixed latency", async () => {
    vi.useFakeTimers()
    const latency = createLatency(50)
    let done = false
    const pending = latency.wait().then(() => {
      done = true
    })
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(50)
    await pending
    expect(done).toBe(true)
  })

  it("honors an initial latency", () => {
    expect(createLatency(25).get()).toBe(25)
  })

  it("rejects non-finite latency values", () => {
    expect(() => createLatency(Number.NaN)).toThrow(RangeError)
    expect(() => createLatency(Number.POSITIVE_INFINITY)).toThrow(RangeError)
    const latency = createLatency()
    expect(() => latency.set(Number.NaN)).toThrow(RangeError)
    expect(() => latency.set(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it("an aborted signal skips the wait and clears the timer", async () => {
    vi.useFakeTimers()
    const latency = createLatency(1000)
    const controller = new AbortController()
    const pending = latency.wait(controller.signal)
    controller.abort()
    await pending // resolves without advancing the clock
  })
})
