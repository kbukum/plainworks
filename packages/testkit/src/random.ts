/**
 * A deterministic, seeded pseudo-random source with convenience draws. Same seed → same sequence,
 * so tests that need "random" data (ids, sampling) stay reproducible and shuffle-safe. Built on the
 * canonical `createSeededRandom` from `@plainworks/std`; not cryptographically secure — for test
 * fixtures only.
 */

import { createSeededRandom } from "@plainworks/std"

export interface SeededRandom {
  /** Next float in the half-open range `[0, 1)`. */
  next(): number
  /** Integer in the inclusive range `[minInclusive, maxInclusive]`. */
  int(minInclusive: number, maxInclusive: number): number
  /** Pick one element from a non-empty array. */
  pick<T>(items: readonly T[]): T
}

/** Build a {@link SeededRandom} from a 32-bit `seed`. */
export function seededRandom(seed: number): SeededRandom {
  const source = createSeededRandom(seed)

  const int = (minInclusive: number, maxInclusive: number): number => {
    if (!Number.isSafeInteger(minInclusive) || !Number.isSafeInteger(maxInclusive)) {
      throw new RangeError("seededRandom.int requires safe-integer bounds")
    }
    if (maxInclusive < minInclusive) {
      throw new RangeError("seededRandom.int requires maxInclusive >= minInclusive")
    }
    const span = maxInclusive - minInclusive + 1
    return minInclusive + Math.floor(source.next() * span)
  }

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new RangeError("seededRandom.pick requires a non-empty array")
    }
    const index = int(0, items.length - 1)
    // `undefined` can be a legitimate element; only a genuine sparse hole is an error.
    if (!Object.hasOwn(items, index)) {
      throw new RangeError("seededRandom.pick landed on a hole in the array")
    }
    return items[index] as T
  }

  return { next: () => source.next(), int, pick }
}
