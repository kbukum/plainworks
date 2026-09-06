import { describe, expect, test, vi } from "vitest"
import { type Clock, systemClock } from "./time"

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
