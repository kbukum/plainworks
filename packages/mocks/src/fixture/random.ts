/**
 * Random data generation helpers. The canonical seeded PRNG lives in `@plainworks/std`
 * (re-exported here); these helpers draw from an injected {@link RandomSource} so mock fixtures
 * are reproducible from a seed and parallel mock servers never share a sequence.
 */

import type { RandomSource } from "@plainworks/std"

export type { RandomSource } from "@plainworks/std"
export { createSeededRandom } from "@plainworks/std"

/** Integer in the inclusive range `[min, max]`. */
export function randomInt(rng: RandomSource, min: number, max: number): number {
  return Math.floor(rng.next() * (max - min + 1)) + min
}

/** Float in `[min, max)` rounded to `decimals` places. */
export function randomFloat(rng: RandomSource, min: number, max: number, decimals = 2): number {
  const value = rng.next() * (max - min) + min
  return Number(value.toFixed(decimals))
}

/** Pick one element from a non-empty array. */
export function randomElement<T>(rng: RandomSource, array: T[]): T {
  if (array.length === 0) {
    throw new RangeError("randomElement requires a non-empty array")
  }
  const index = Math.floor(rng.next() * array.length)
  // `undefined` can be a legitimate element; only a genuine sparse hole is an error.
  if (!Object.hasOwn(array, index)) {
    throw new RangeError("randomElement landed on a hole in the array")
  }
  return array[index] as T
}

/** Pick `count` distinct elements (unbiased partial Fisher–Yates shuffle). */
export function randomElements<T>(rng: RandomSource, array: T[], count: number): T[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("randomElements requires a non-negative integer count")
  }
  const shuffled = [...array]
  const take = Math.min(count, shuffled.length)
  for (let i = 0; i < take; i += 1) {
    const j = randomInt(rng, i, shuffled.length - 1)
    const a = shuffled[i]
    const b = shuffled[j]
    if (a !== undefined && b !== undefined) {
      shuffled[i] = b
      shuffled[j] = a
    }
  }
  return shuffled.slice(0, take)
}

/** True with the given probability (default 0.5). */
export function randomBoolean(rng: RandomSource, probability = 0.5): boolean {
  return rng.next() < probability
}

const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

/** Random alphanumeric string of `length`. */
export function randomString(rng: RandomSource, length: number): string {
  return Array.from({ length }, () => CHARS[randomInt(rng, 0, CHARS.length - 1)]).join("")
}
