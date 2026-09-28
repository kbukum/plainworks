import { describe, expect, it } from "vitest"
import { planRunRetention } from "./retention"

const MB = 1024 * 1024
const runs = ["r1", "r2", "r3", "r4", "r5", "r6"].map((id) => ({ id, bytes: 10 * MB }))

describe("planRunRetention", () => {
  it("keeps the newest runs and removes the rest, oldest first", () => {
    expect(planRunRetention(runs, { keepRuns: 3, maxBytes: 1024 * MB }, "r6")).toEqual([
      "r1",
      "r2",
      "r3",
    ])
  })

  it("removes more old runs while the kept ones exceed the size cap", () => {
    expect(planRunRetention(runs, { keepRuns: 5, maxBytes: 25 * MB }, "r6")).toEqual([
      "r1",
      "r2",
      "r3",
      "r4",
    ])
  })

  it("never removes the current run, even when it alone exceeds the cap", () => {
    expect(
      planRunRetention([{ id: "r1", bytes: 900 * MB }], { keepRuns: 1, maxBytes: MB }, "r1"),
    ).toEqual([])
  })

  it("orders runs by id, whatever order the directory listing returns", () => {
    const shuffled = [runs[4], runs[0], runs[5], runs[2], runs[1], runs[3]].flatMap((run) =>
      run === undefined ? [] : [run],
    )
    expect(planRunRetention(shuffled, { keepRuns: 2, maxBytes: 1024 * MB }, "r6")).toEqual([
      "r1",
      "r2",
      "r3",
      "r4",
    ])
  })

  it("counts the current run inside keepRuns, even when newer runs finished first", () => {
    expect(planRunRetention(runs, { keepRuns: 3, maxBytes: 1024 * MB }, "r2")).toEqual([
      "r1",
      "r3",
      "r4",
    ])
  })

  it("rejects a policy that would keep no run at all", () => {
    expect(() => planRunRetention(runs, { keepRuns: 0, maxBytes: MB }, "r6")).toThrow(RangeError)
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects a byte cap of %s instead of pruning by it",
    (maxBytes) => {
      expect(() => planRunRetention(runs, { keepRuns: 3, maxBytes }, "r6")).toThrow(RangeError)
    },
  )
})
