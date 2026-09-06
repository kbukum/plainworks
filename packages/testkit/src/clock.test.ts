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
