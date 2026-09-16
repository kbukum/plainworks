// The event delivery seam is owned by `@plainworks/std` so `channel`'s state sink and `query`'s
// cache sink are the same contract and both plug into a single router. Re-exported here for local
// use; `channel` adds no delivery semantics of its own.
export type { EventSink } from "@plainworks/std"
