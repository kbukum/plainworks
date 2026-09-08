// Server-safe public entry for `@plainworks/query` — the protocol-agnostic TanStack cache substrate.
// Re-export-only barrel (no logic here; implementation lives in concern-named modules). No React or DOM
// imports, so the `.` entry runs anywhere (Node, edge, RSC): the client factory, cache routing + event
// sink, RSC prefetch/hydrate helpers, the `remote` StateSource scope, and the list-query cache keys.
// The `"use client"` provider + `HydrationBoundary` live in the separate `./client` entry.
export type {
  OptimisticUpdate,
  QueryCacheAction,
  QueryEventRouter,
  QueryEventSink,
} from "./cache"
export {
  createQueryEventSink,
  invalidateCache,
  optimisticUpdate,
  writeQueryData,
} from "./cache"
export type { DehydrateClientOptions, DehydratedState, PrefetchOutcome } from "./hydration"
export {
  dehydrateClient,
  hydrateClient,
  prefetchInfiniteQuery,
  prefetchQuery,
} from "./hydration"
export type {
  InfiniteListKeyOptions,
  InfiniteListQueryOptionsInput,
  InfiniteListQueryPlan,
  ListKeyOptions,
  ListQueryOptionsInput,
  ListQueryPlan,
} from "./list"
export {
  infiniteListQueryKey,
  infiniteListQueryOptions,
  listQueryKey,
  listQueryOptions,
} from "./list"
export { createQueryClient } from "./query-client"
export type { RemoteScopeOptions } from "./remote"
export { createRemoteScope, createRemoteSource, REMOTE_CAPABILITIES } from "./remote"
