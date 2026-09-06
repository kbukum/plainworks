/**
 * Seeded pseudo-randomness. The canonical {@link RandomSource} lives here in `std` so any layer
 * (testkit, mocks, and later packages) shares one implementation instead of drifting copies.
 */

/** A stream of uniform floats in the half-open range `[0, 1)`. */
export interface RandomSource {
  /** Next float in `[0, 1)`. */
  next(): number
}

/**
 * Build a seeded {@link RandomSource} (mulberry32): tiny, fast, and stable across runs and
 * platforms — same seed, same sequence. Not cryptographically secure; for deterministic fixtures
 * and tests, never for security purposes (use `randomId` / Web Crypto there).
 */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}
