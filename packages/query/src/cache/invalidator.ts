import type { CacheInvalidator } from "@plainworks/std/seam"
import type { InvalidateQueryFilters, QueryClient } from "@tanstack/query-core"

/**
 * Implement the `std/seam` {@link CacheInvalidator} on a TanStack {@link QueryClient}. A target key
 * is a partial match unless `exact` is set, and no key invalidates every query. Invalidation
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
      const filters: InvalidateQueryFilters = {}
      if (target.key !== undefined) {
        filters.queryKey = target.key
      }
      if (target.exact !== undefined) {
        filters.exact = target.exact
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
