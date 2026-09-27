import { expect, test } from "vitest"
import { manualClock } from "./clock"

test("manualClock starts at 0 by default and reads back through the Clock seam", () => {
  const clock = manualClock()
  expect(clock.now()).toBe(0)
})

test("manualClock honours a custom start time", () => {
  const clock = manualClock(1_000)
  expect(clock.now()).toBe(1_000)
})

test("advance moves time forward cumulatively", () => {
  const clock = manualClock(100)
  clock.advance(50)
  clock.advance(25)
  expect(clock.now()).toBe(175)
})

test("advance rejects a negative duration", () => {
  const clock = manualClock()
  expect(() => clock.advance(-1)).toThrow(RangeError)
})

test("set replaces the absolute current time", () => {
  const clock = manualClock(100)
  clock.set(5_000)
  expect(clock.now()).toBe(5_000)
})

test("manualClock starts at an ISO-8601 instant", () => {
  expect(manualClock("2026-01-15T12:00:00.000Z").now()).toBe(Date.UTC(2026, 0, 15, 12))
  expect(manualClock("2026-01-15T13:30:00+01:30").now()).toBe(Date.UTC(2026, 0, 15, 12))
})

test("manualClock rejects a start that does not name one instant", () => {
  // A zone-less timestamp reads as local time, so it would differ between machines.
  for (const start of ["2026-01-15T12:00:00", "2026-01-15", "tomorrow", "2026-13-40T00:00:00Z"]) {
    expect(() => manualClock(start), start).toThrow(RangeError)
  }
  expect(() => manualClock(Number.NaN)).toThrow(RangeError)
})
