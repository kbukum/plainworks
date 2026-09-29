---
"@plainworks/connect": minor
---

Replace `createInvalidator(queryClient)` with `createMethodInvalidator(cache)`, which builds on the std `CacheInvalidator` seam and accepts an abort `signal`. Wire it with `createCacheInvalidator` from `@plainworks/query/cache`. Redesign the entry points so each concern has its own path: `.` holds the transport and `RpcError`, and interceptors and the query bindings move to `./interceptor` and `./query`.
