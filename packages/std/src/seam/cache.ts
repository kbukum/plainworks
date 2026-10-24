import { isRecord } from "../guard"
import type { WebAbortSignal } from "../web"

/** A structural cache key: an array of serializable parts, most general first (`["users", id]`). */
export type CacheKey = readonly unknown[]

/**
 * Which cache entries an invalidation hits. By default `key` is a **partial** match: `["users"]`
 * matches `["users"]` and every `["users", …]` entry, and an object part matches when every field
 * it names matches (`{ id: 1 }` matches `{ id: 1, role: "admin" }`). Set `exact` to match only an
 * entry whose key equals `key`. Omit `key` to match the whole cache. As in a serialized key, an
 * object field set to `undefined` counts as absent.
 */
export interface CacheTarget {
  readonly key?: CacheKey
  readonly exact?: boolean
}

/**
 * Whether the entry under `key` is hit by `target`, by the rules {@link CacheTarget} describes.
 * Every {@link CacheInvalidator} matches with this function, so the rule has one owner.
 */
export function matchesCacheTarget(key: CacheKey, target: CacheTarget): boolean {
  if (target.key === undefined) return true
  return target.exact === true ? isSameCacheKey(key, target.key) : isPartialMatch(key, target.key)
}

/**
 * Whether two keys name the same cache entry. Arrays compare item by item and objects by their
 * fields, with a field set to `undefined` counted as absent, as in a serialized key.
 */
export function isSameCacheKey(left: CacheKey, right: CacheKey): boolean {
  return isSameKeyPart(left, right)
}

/** Whether two key parts are equal: arrays item by item, objects by their defined fields. */
function isSameKeyPart(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, i) => isSameKeyPart(item, right[i]))
  }
  if (isRecord(left) && isRecord(right)) {
    const fields = definedFields(left)
    return (
      fields.length === definedFields(right).length &&
      fields.every((field) => isSameKeyPart(left[field], right[field]))
    )
  }
  return false
}

function definedFields(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter((field) => record[field] !== undefined)
}

/**
 * Whether `entry` holds everything `partial` names: arrays by prefix, objects by named fields. An
 * array never matches an object, and a field set to `undefined` matches an absent one.
 */
function isPartialMatch(entry: unknown, partial: unknown): boolean {
  if (Object.is(entry, partial)) return true
  if (Array.isArray(entry) && Array.isArray(partial)) {
    return (
      partial.length <= entry.length && partial.every((item, i) => isPartialMatch(entry[i], item))
    )
  }
  if (isRecord(entry) && isRecord(partial)) {
    return Object.keys(partial).every((field) => isPartialMatch(entry[field], partial[field]))
  }
  return false
}

/** Options for {@link CacheInvalidator.invalidate}. */
export interface CacheInvalidateOptions {
  /** Aborting cancels the in-flight fetches of the matched entries instead of letting them land. */
  readonly signal?: WebAbortSignal
}

/**
 * The cache-invalidation seam: mark entries stale so they are read again. A cache owner (the
 * `@plainworks/query` TanStack cache) implements it; a protocol package builds keys and depends
 * only on this shape, so two packages on the same layer share one invalidation model without
 * importing each other.
 */
export interface CacheInvalidator {
  /**
   * Mark every entry matching `target` stale and resolve once the resulting refetches settle.
   * When `options.signal` aborts, cancel those refetches and resolve.
   */
  invalidate(target?: CacheTarget, options?: CacheInvalidateOptions): Promise<void>
}
