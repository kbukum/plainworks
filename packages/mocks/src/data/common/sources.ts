/**
 * Per-domain fixture sources. Each domain (users, orders, …) gets its own RNG stream derived from
 * the mock's seed, so generated content is reproducible and independent of which store or endpoint
 * is accessed first. IDs come from a per-domain counter (deterministic, unique per mock graph) and
 * timestamps from an injected `Clock`.
 */

import { type Clock, createSeededRandom, type RandomSource, systemClock } from "@plainworks/std"

/** Everything a data factory needs to generate deterministic fixtures. */
export interface FixtureSources {
  /** This domain's seeded random stream. */
  readonly rng: RandomSource
  /** Time source for fixture timestamps. */
  readonly clock: Clock
  /** Next deterministic, per-domain unique entity id (e.g. `user_0`). */
  nextId(prefix?: string): string
}

/** Derive a stable per-domain seed from the mock seed (FNV-style mix over the domain name). */
function deriveSeed(seed: number, domain: string): number {
  let hash = seed >>> 0
  for (const char of domain) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 2654435761) >>> 0 || 1
  }
  return hash
}

/** Build the {@link FixtureSources} for one domain of one mock graph. */
export function createFixtureSources(
  seed: number,
  domain: string,
  clock: Clock = systemClock,
): FixtureSources {
  const rng = createSeededRandom(deriveSeed(seed, domain))
  let counter = 0
  return {
    rng,
    clock,
    nextId(prefix = ""): string {
      const id = (counter++).toString(36)
      return prefix ? `${prefix}_${id}` : id
    },
  }
}

/** A {@link FixtureSources} whose backing instance can be swapped (used to rewind on reset). */
export interface ReloadableFixtureSources extends FixtureSources {
  /** Swap in freshly built sources, rewinding the RNG stream and id counter. */
  reload(): void
}

/**
 * Build a delegating {@link FixtureSources} whose backing stream/counter can be rebuilt in place.
 * Factories and handlers keep the stable reference; `reload()` rewinds generation to its initial
 * state so a create after a reset replays exactly.
 */
export function createReloadableFixtureSources(
  seed: number,
  domain: string,
  clock: Clock = systemClock,
): ReloadableFixtureSources {
  let current = createFixtureSources(seed, domain, clock)
  return {
    get rng() {
      return current.rng
    },
    get clock() {
      return current.clock
    },
    nextId(prefix?: string): string {
      return current.nextId(prefix)
    },
    reload(): void {
      current = createFixtureSources(seed, domain, clock)
    },
  }
}
