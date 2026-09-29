---
"@plainworks/query": minor
---

Replace `invalidateCache` with `createCacheInvalidator(queryClient)`, the TanStack implementation of the std `CacheInvalidator` seam. It matches keys partially or exactly and cancels the refetches when its signal aborts. The event sink's `invalidate` action now takes a cache target. Redesign the entry points so each concern has its own path: `.` holds the query client, and `./cache`, `./hydration`, `./list`, and `./remote` hold the rest. The std list types are no longer re-exported.
