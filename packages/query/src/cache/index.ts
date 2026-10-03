// Re-export-only barrel for the protocol-agnostic cache-routing concern: the write, invalidate and
// optimistic primitives and the event sink that folds a neutral `PlainEvent` into the cache. No
// logic here.
export type { QueryCacheAction, QueryEventRouter } from "./event-sink"
export { createQueryEventSink } from "./event-sink"
export { createCacheInvalidator } from "./invalidator"
export type { LiveQuery, LiveQueryOptions, LiveQueryStatus } from "./live-query"
export { createLiveQuery, SnapshotStaleError } from "./live-query"
export type { OptimisticUpdate } from "./routing"
export { optimisticUpdate, writeQueryData } from "./routing"
