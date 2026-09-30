import type { CacheInvalidator, CacheKey, CacheTarget } from "@plainworks/std/seam"

/** A {@link CacheInvalidator} over an in-memory key set, so a test can assert what went stale. */
export interface FakeCacheInvalidator extends CacheInvalidator {
  /** Add a fresh entry under `key`. */
  seed(key: CacheKey): void
  /** Whether the entry under `key` was invalidated since it was seeded. */
  isStale(key: CacheKey): boolean
  /** Every target passed to `invalidate`, in order. */
  readonly targets: readonly CacheTarget[]
}

function isSameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, i) => isSameValue(item, right[i]))
  }
  if (
    left !== null &&
    right !== null &&
    typeof left === "object" &&
    typeof right === "object" &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const leftKeys = Object.keys(left)
    const rightRecord = right as Record<string, unknown>
    return (
      leftKeys.length === Object.keys(right).length &&
      leftKeys.every((key) => isSameValue((left as Record<string, unknown>)[key], rightRecord[key]))
    )
  }
  return false
}

/** Whether `entry` holds everything `partial` names: arrays by prefix, objects by named fields. */
function isPartialMatch(entry: unknown, partial: unknown): boolean {
  if (Object.is(entry, partial)) {
    return true
  }
  if (
    entry === null ||
    partial === null ||
    typeof entry !== "object" ||
    typeof partial !== "object"
  ) {
    return false
  }
  const entryRecord = entry as Record<string, unknown>
  const partialRecord = partial as Record<string, unknown>
  return Object.keys(partialRecord).every((field) =>
    isPartialMatch(entryRecord[field], partialRecord[field]),
  )
}

function matchesTarget(key: CacheKey, target: CacheTarget): boolean {
  if (target.key === undefined) {
    return true
  }
  return target.exact === true ? isSameValue(key, target.key) : isPartialMatch(key, target.key)
}

/**
 * Build a {@link FakeCacheInvalidator}. It matches keys the way the seam describes: a partial match
 * (arrays by prefix, objects by the fields named) unless `exact` is set, and no key matches
 * everything.
 */
export function fakeCacheInvalidator(): FakeCacheInvalidator {
  const entries: Array<{ readonly key: CacheKey; stale: boolean }> = []
  const targets: CacheTarget[] = []
  const find = (key: CacheKey) => entries.find((entry) => isSameValue(entry.key, key))
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
        if (matchesTarget(entry.key, target)) {
          entry.stale = true
        }
      }
      return Promise.resolve()
    },
  }
}
