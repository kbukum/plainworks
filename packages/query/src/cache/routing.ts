import type { InvalidateQueryFilters, QueryClient, QueryKey, Updater } from "@tanstack/query-core"

/**
 * Write decoded data into the cache for `queryKey` — the payload-carrying half of protocol-agnostic
 * cache routing. `updater` is either the next value or a `(previous) => next` function (the standard
 * TanStack updater), so a caller can fold an event onto the current value without a separate read.
 * An updater that returns `undefined` **evicts** the slot (TanStack's own `setQueryData(key, undefined)`
 * is a no-op, so eviction is the only way to truly clear). Returns the value now in the cache, or
 * `undefined` if it was evicted. Thin by design: it owns no protocol knowledge — the caller decides
 * the key and the fold.
 */
export function writeQueryData<T>(
  client: QueryClient,
  queryKey: QueryKey,
  updater: Updater<T | undefined, T | undefined>,
): T | undefined {
  const previous = client.getQueryData<T>(queryKey)
  const next =
    typeof updater === "function"
      ? (updater as (prev: T | undefined) => T | undefined)(previous)
      : updater
  setOrEvict(client, queryKey, next)
  return next
}

/**
 * Mark cached queries stale so TanStack refetches them — the change-signal half of cache routing, for
 * an event that says "something changed, re-read it" without carrying the new value. Matching is a
 * **prefix** match on `filters.queryKey` (as TanStack invalidation always is), so invalidating
 * `["users"]` refetches every `["users", …]` query. Returns the settle promise of the refetches.
 */
export function invalidateCache(
  client: QueryClient,
  filters?: InvalidateQueryFilters,
): Promise<void> {
  return client.invalidateQueries(filters)
}

/** The rollback handle returned by {@link optimisticUpdate}: restore the pre-update value on failure. */
export interface OptimisticUpdate<T> {
  /** The value cached before the optimistic write, for assertions or manual reconciliation. */
  readonly previous: T | undefined
  /**
   * Restore the cache to {@link previous} — call when the backing mutation rejects. Compare-and-set
   * on the **write revision** (the query object and its `dataUpdateCount`): the restore happens only
   * while the slot still holds exactly this update's write, so a failed older mutation never
   * overwrites a newer one — even a newer write of an equal value (indistinguishable by reference)
   * or an eviction followed by a rewrite (a fresh query object). Returns whether the restore ran —
   * `false` means a newer write won and the snapshot was dropped.
   */
  rollback(): boolean
}

/**
 * Apply an optimistic write and hand back a `rollback` — the optimistic-then-reconcile pattern for a
 * mutation. It snapshots the current value, writes `apply(previous)` immediately, and returns the
 * snapshot plus a `rollback` that restores it. The caller performs the real mutation and calls
 * `rollback()` on failure (and typically invalidates on success to reconcile against the server). No
 * timers or retained subscriptions: the rollback closes over the snapshot only, so nothing leaks if it
 * is never called.
 */
export function optimisticUpdate<T>(params: {
  readonly client: QueryClient
  readonly queryKey: QueryKey
  readonly apply: (previous: T | undefined) => T | undefined
}): OptimisticUpdate<T> {
  const { client, queryKey, apply } = params
  const previous = client.getQueryData<T>(queryKey)
  setOrEvict(client, queryKey, apply(previous))
  // Capture the write revision — the query object identity plus its `dataUpdateCount`. A value or
  // reference compare cannot tell "unchanged" from "overwritten with an equal value" (TanStack's
  // structural sharing can even hand back the same reference); the revision can.
  const cache = client.getQueryCache()
  const appliedQuery = cache.find({ queryKey, exact: true })
  const appliedRevision = appliedQuery?.state.dataUpdateCount
  return {
    previous,
    rollback: () => {
      const current = cache.find({ queryKey, exact: true })
      // Evicted (or evicted and rewritten) since the optimistic write, or a newer write landed on
      // the same query object — either way a newer intent owns the slot and the snapshot is stale.
      // When this write was itself an eviction (`appliedQuery` undefined), the restore runs only
      // while the slot is still empty.
      if (current !== appliedQuery) {
        return false
      }
      if (current !== undefined && current.state.dataUpdateCount !== appliedRevision) {
        return false
      }
      setOrEvict(client, queryKey, previous)
      return true
    },
  }
}

/**
 * Write `value` for `queryKey`, but **evict** the slot when `value` is `undefined`. TanStack's
 * `setQueryData(key, undefined)` is a no-op — it never deletes — so an `undefined` target must remove
 * the query to truly mean "no value". This keeps the optimistic write symmetric with its rollback: an
 * optimistic clear (`apply` returning `undefined`) actually clears, and restoring a slot that was empty
 * before the write actually empties it.
 */
function setOrEvict<T>(client: QueryClient, queryKey: QueryKey, value: T | undefined): void {
  if (value === undefined) {
    client.removeQueries({ queryKey, exact: true })
  } else {
    client.setQueryData<T>(queryKey, value)
  }
}
