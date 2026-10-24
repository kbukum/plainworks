import { type CacheInvalidator, matchesCacheTarget } from "@plainworks/std/seam"
import type { InvalidateQueryFilters, QueryClient } from "@tanstack/query-core"

/**
 * Implement the `std/seam` {@link CacheInvalidator} on a TanStack {@link QueryClient}. Queries are
 * matched with the seam's {@link matchesCacheTarget}, not TanStack's own key rules, so every
 * invalidator agrees. Invalidation
 * refetches the active matches and resolves once they settle. An abort cancels those refetches, and
 * a signal that has already aborted invalidates nothing.
 */
export function createCacheInvalidator(client: QueryClient): CacheInvalidator {
  return {
    async invalidate(target = {}, options = {}) {
      const { signal } = options
      if (signal?.aborted) {
        return
      }
      const filters: InvalidateQueryFilters = {
        predicate: (query) => matchesCacheTarget(query.queryKey, target),
      }
      const onAbort = (): void => {
        void client.cancelQueries(filters)
      }
      signal?.addEventListener("abort", onAbort, { once: true })
      try {
        await client.invalidateQueries(filters)
      } finally {
        signal?.removeEventListener("abort", onAbort)
      }
    },
  }
}
