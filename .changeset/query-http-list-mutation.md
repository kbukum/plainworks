---
"@plainworks/query": patch
---

Two new entries remove the list and write boilerplate apps were repeating.

- **`@plainworks/query/http-list`.** `httpListQuery` describes an HTTP list once. You get a validated `read` and a query plan with the same cache key, so a server prefetch and the client query share one entry.
- **`@plainworks/query/mutation`.** `optimisticMutationOptions` handles an optimistic write for you. It cancels in-flight fetches, patches the cache, rolls back on failure, and re-syncs once the last write settles.
