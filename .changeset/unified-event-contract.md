---
"@plainworks/std": minor
"@plainworks/channel": minor
"@plainworks/query": minor
---

Unify event delivery on a single seam so one live stream can drive both scoped state and the query cache with no bespoke bus.

- **One event, one sink.** `@plainworks/std` now owns the `EventSink` contract alongside the existing `PlainEvent` shape. `channel`'s decoded-event type and `query`'s cache-sink interface are gone — both consume the same `EventSink<PlainEvent>`, so a state sink and a query sink drop into the same router's `sinks` list. Previously the two shapes were incompatible types that could not be wired together.
- **A settled contract, not just a shape.** Delivery is serial and backpressure-aware, the abort signal is a required part of every delivery (a sink that writes past shutdown is a bug), a rejecting sink is always observable to its driver, and sinks must be idempotent because a resume-from-cursor reconnect may redeliver events.
- **`channel` moves to the shared shape.** Its decoder, router, state sink, and public surface now speak `PlainEvent` (`data`, not `payload`); the vestigial per-event id — never read by a sink and tracked separately by the channel for reconnect resume — is dropped.
