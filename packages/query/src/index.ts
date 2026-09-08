// Server-safe public entry for `@plainworks/query` — the protocol-agnostic TanStack cache substrate.
// Re-export-only barrel (no logic here; implementation lives in concern-named modules). No React or DOM
// imports, so the `.` entry runs anywhere (Node, edge, RSC): the client factory, cache routing + event
// sink, RSC prefetch/hydrate helpers, the `remote` StateSource scope, and the list-query cache keys.
// The `"use client"` provider + `HydrationBoundary` live in the separate `./client` entry.

// The protocol-agnostic list contract, surfaced from `@plainworks/std` so a `query` consumer imports
// list types from the one package it already reached for. The URL serializer `buildListQuery` is not
// re-exported here — it stays an `@plainworks/http` import, paired with the client call that uses it.
export type {
  CursorInfo,
  CursorResult,
  Facets,
  FilterOperator,
  FilterValue,
  ListFilter,
  ListMembershipFilter,
  ListQueryParams,
  PageInfo,
  PaginatedResult,
  PresenceFilter,
  ScalarFilter,
  SortDirection,
} from "@plainworks/std"
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
