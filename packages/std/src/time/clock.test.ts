import { describe, expect, test, vi } from "vitest"
import { type Clock, fixedClock, parseTimestamp, systemClock } from "./clock"

describe("systemClock", () => {
  test("reports the current epoch milliseconds from the host clock", () => {
    const fixed = 1_700_000_000_000
    const spy = vi.spyOn(Date, "now").mockReturnValue(fixed)
    expect(systemClock.now()).toBe(fixed)
    spy.mockRestore()
  })
})

describe("Clock seam", () => {
  test("is satisfied by a deterministic fake for injection", () => {
    const fake: Clock = { now: () => 1_000 }
    expect(fake.now()).toBe(1_000)
  })
})

describe("parseTimestamp", () => {
  test("passes finite epoch milliseconds through", () => {
    expect(parseTimestamp(0)).toBe(0)
    expect(parseTimestamp(1_700_000_000_000)).toBe(1_700_000_000_000)
  })

  test("parses an ISO-8601 timestamp with a zone", () => {
    expect(parseTimestamp("2026-01-15T12:00:00.000Z")).toBe(Date.UTC(2026, 0, 15, 12))
    expect(parseTimestamp("2026-01-15T14:00+02:00")).toBe(Date.UTC(2026, 0, 15, 12))
  })

  test.each([
    "2026-01-15T12:00:00",
    "2026-01-15",
    "yesterday",
    "",
    "2026-02-30T12:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-01-15T24:30:00Z",
  ])("rejects %j, which does not name one moment", (input) => {
    expect(() => parseTimestamp(input)).toThrow(RangeError)
  })

  test.each([Number.NaN, Number.POSITIVE_INFINITY])("rejects the non-finite %s", (input) => {
    expect(() => parseTimestamp(input)).toThrow(RangeError)
  })
})

describe("fixedClock", () => {
  test("always reports the pinned timestamp", () => {
    const clock = fixedClock("2026-01-15T12:00:00.000Z")
    expect(clock.now()).toBe(Date.UTC(2026, 0, 15, 12))
    expect(clock.now()).toBe(clock.now())
  })

  test("accepts epoch milliseconds", () => {
    expect(fixedClock(42).now()).toBe(42)
  })

  test("fails fast on a timestamp it cannot pin", () => {
    expect(() => fixedClock("not a date")).toThrow(RangeError)
  })
})
