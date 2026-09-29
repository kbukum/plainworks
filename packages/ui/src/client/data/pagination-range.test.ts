import { describe, expect, it } from "vitest"
import { getPaginationRange } from "./pagination-range"

describe("getPaginationRange", () => {
  it("returns a single slot when there is at most one page", () => {
    expect(getPaginationRange(1, 0)).toEqual([1])
    expect(getPaginationRange(1, 1)).toEqual([1])
  })

  it("lists every page when they all fit without a gap", () => {
    expect(getPaginationRange(3, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it("collapses only the right side near the start", () => {
    expect(getPaginationRange(2, 10)).toEqual([1, 2, 3, 4, 5, "ellipsis", 10])
  })

  it("collapses only the left side near the end", () => {
    expect(getPaginationRange(9, 10)).toEqual([1, "ellipsis", 6, 7, 8, 9, 10])
  })

  it("collapses both sides in the middle", () => {
    expect(getPaginationRange(5, 10)).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 10])
  })

  it("clamps an out-of-range page into the valid window", () => {
    expect(getPaginationRange(99, 10)).toEqual([1, "ellipsis", 6, 7, 8, 9, 10])
    expect(getPaginationRange(-3, 10)).toEqual([1, 2, 3, 4, 5, "ellipsis", 10])
  })

  it("widens the window with a larger sibling count", () => {
    expect(getPaginationRange(5, 12, 2)).toEqual([1, "ellipsis", 3, 4, 5, 6, 7, "ellipsis", 12])
  })

  it("normalizes non-finite and fractional inputs so no bogus page leaks in", () => {
    expect(getPaginationRange(Number.NaN, Number.NaN)).toEqual([1])
    expect(getPaginationRange(2.9, 10)).toEqual(getPaginationRange(2, 10))
    expect(getPaginationRange(5, 10.7, 1.5)).toEqual(getPaginationRange(5, 10, 1))
    expect(getPaginationRange(Number.POSITIVE_INFINITY, 10)).toEqual(getPaginationRange(1, 10))
  })
})
