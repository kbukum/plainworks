---
"@plainworks/query": minor
---

`createQueryClient` now keeps data fresh for 60 seconds by default (`DEFAULT_QUERY_STALE_TIME_MS`). Server-rendered data is no longer refetched the moment the page hydrates, so the first paint stays stable. Set `defaultOptions.queries.staleTime` to choose a different window.
