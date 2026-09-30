import { describe, expect, it } from "vitest"
import { samplePairwise } from "./pairwise"

function pairsOf(rows: readonly (readonly number[])[]): Set<string> {
  const pairs = new Set<string>()
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      for (let j = i + 1; j < row.length; j++) pairs.add(`${i}:${row[i]}|${j}:${row[j]}`)
    }
  }
  return pairs
}

function allPairs(sizes: readonly number[]): Set<string> {
  const pairs = new Set<string>()
  for (let i = 0; i < sizes.length; i++) {
    for (let j = i + 1; j < sizes.length; j++) {
      for (let a = 0; a < (sizes[i] ?? 0); a++) {
        for (let b = 0; b < (sizes[j] ?? 0); b++) pairs.add(`${i}:${a}|${j}:${b}`)
      }
    }
  }
  return pairs
}

describe("samplePairwise", () => {
  it("covers every pair of values across every two axes", () => {
    const sizes = [5, 2, 9, 2, 5]
    const rows = samplePairwise(sizes)
    expect(pairsOf(rows)).toEqual(allPairs(sizes))
  })

  it("needs far fewer rows than the full cross product", () => {
    const rows = samplePairwise([5, 2, 9, 2, 5])
    expect(rows.length).toBeLessThan(5 * 2 * 9 * 2 * 5)
    expect(rows.length).toBeLessThanOrEqual(60)
    // Never fewer than the two widest axes crossed, which every pairwise set must contain.
    expect(rows.length).toBeGreaterThanOrEqual(45)
  })

  it("returns the same rows on every call, so a preset always samples the same variants", () => {
    expect(samplePairwise([3, 4, 2])).toEqual(samplePairwise([3, 4, 2]))
  })

  it("keeps every value in range, and crosses a single axis into one row per value", () => {
    expect(samplePairwise([3])).toEqual([[0], [1], [2]])
    for (const row of samplePairwise([2, 3, 4])) {
      expect(row[0]).toBeLessThan(2)
      expect(row[1]).toBeLessThan(3)
      expect(row[2]).toBeLessThan(4)
    }
  })

  it("rejects an empty axis", () => {
    expect(() => samplePairwise([2, 0])).toThrow(RangeError)
  })
})
