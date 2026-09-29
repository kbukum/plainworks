import { isPositiveInteger } from "@plainworks/std"
/**
 * Sample rows over axes of `sizes` values so every pair of values across every two axes appears in
 * at least one row (all-pairs testing). Most layout defects come from one value or from two values
 * together, so the sample finds nearly what the full cross product would at a fraction of its size.
 *
 * Each row holds one value index per axis. The sampler is greedy and deterministic: it seeds each
 * row with the first pair still uncovered, then fills the other axes with the value that covers
 * the most uncovered pairs, preferring the earlier value on a tie. Throws {@link RangeError} for an
 * empty axis.
 */
export function samplePairwise(sizes: readonly number[]): number[][] {
  if (sizes.some((size) => !isPositiveInteger(size))) {
    throw new RangeError("Every pairwise axis needs at least one value")
  }
  if (sizes.length < 2) {
    return Array.from({ length: sizes[0] ?? 0 }, (_, value) => [value])
  }
  const key = (i: number, a: number, j: number, b: number): string =>
    i < j ? `${i}:${a}|${j}:${b}` : `${j}:${b}|${i}:${a}`
  const uncovered = new Set<string>()
  const ordered: [number, number, number, number][] = []
  for (let i = 0; i < sizes.length; i++) {
    for (let j = i + 1; j < sizes.length; j++) {
      for (let a = 0; a < (sizes[i] ?? 0); a++) {
        for (let b = 0; b < (sizes[j] ?? 0); b++) {
          uncovered.add(key(i, a, j, b))
          ordered.push([i, a, j, b])
        }
      }
    }
  }

  const rows: number[][] = []
  let cursor = 0
  while (uncovered.size > 0) {
    let seed = ordered[cursor]
    while (seed !== undefined && !uncovered.has(key(...seed))) seed = ordered[++cursor]
    if (seed === undefined) break
    const [i, a, j, b] = seed
    const row: (number | undefined)[] = sizes.map(() => undefined)
    row[i] = a
    row[j] = b
    for (let axis = 0; axis < sizes.length; axis++) {
      if (row[axis] !== undefined) continue
      let best = 0
      let bestGain = -1
      for (let value = 0; value < (sizes[axis] ?? 0); value++) {
        let gain = 0
        for (const [other, chosen] of row.entries()) {
          if (chosen !== undefined && uncovered.has(key(axis, value, other, chosen))) gain++
        }
        if (gain > bestGain) {
          best = value
          bestGain = gain
        }
      }
      row[axis] = best
    }
    const filled = row.map((value) => value ?? 0)
    for (let x = 0; x < filled.length; x++) {
      for (let y = x + 1; y < filled.length; y++) {
        uncovered.delete(key(x, filled[x] ?? 0, y, filled[y] ?? 0))
      }
    }
    rows.push(filled)
  }
  return rows
}
