// Re-export-only barrel for the protocol-agnostic cache-routing concern: the write/invalidate/optimistic
// primitives and the event sink that folds a neutral `PlainEvent` into the cache. No logic here.
export type { QueryCacheAction, QueryEventRouter, QueryEventSink } from "./event-sink"
export { createQueryEventSink } from "./event-sink"
export type { OptimisticUpdate } from "./routing"
export { invalidateCache, optimisticUpdate, writeQueryData } from "./routing"
