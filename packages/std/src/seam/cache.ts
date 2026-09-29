import type { WebAbortSignal } from "../web"

/** A structural cache key: an array of serializable parts, most general first (`["users", id]`). */
export type CacheKey = readonly unknown[]

/**
 * Which cache entries an invalidation hits. By default `key` is a **partial** match: `["users"]`
 * matches `["users"]` and every `["users", …]` entry, and an object part matches when every field
 * it names matches (`{ id: 1 }` matches `{ id: 1, role: "admin" }`). Set `exact` to match only an
 * entry whose key equals `key`. Omit `key` to match the whole cache.
 */
export interface CacheTarget {
  readonly key?: CacheKey
  readonly exact?: boolean
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
