import {
  type CacheInvalidator,
  type CacheKey,
  type CacheTarget,
  isSameCacheKey,
  matchesCacheTarget,
} from "@plainworks/std/seam"

/** A {@link CacheInvalidator} over an in-memory key set, so a test can assert what went stale. */
export interface FakeCacheInvalidator extends CacheInvalidator {
  /** Add a fresh entry under `key`. */
  seed(key: CacheKey): void
  /** Whether the entry under `key` was invalidated since it was seeded. */
  isStale(key: CacheKey): boolean
  /** Every target passed to `invalidate`, in order. */
  readonly targets: readonly CacheTarget[]
}

/**
 * Build a {@link FakeCacheInvalidator}. It records targets and marks entries stale with the seam's
 * own {@link matchesCacheTarget}, so it matches exactly as every real invalidator does.
 */
export function fakeCacheInvalidator(): FakeCacheInvalidator {
  const entries: Array<{ readonly key: CacheKey; stale: boolean }> = []
  const targets: CacheTarget[] = []
  const find = (key: CacheKey) => entries.find((entry) => isSameCacheKey(entry.key, key))
  return {
    targets,
    seed(key) {
      const existing = find(key)
      if (existing === undefined) {
        entries.push({ key, stale: false })
      } else {
        existing.stale = false
      }
    },
    isStale(key) {
      return find(key)?.stale ?? false
    },
    invalidate(target = {}) {
      targets.push(target)
      for (const entry of entries) {
        if (matchesCacheTarget(entry.key, target)) {
          entry.stale = true
        }
      }
      return Promise.resolve()
    },
  }
}
