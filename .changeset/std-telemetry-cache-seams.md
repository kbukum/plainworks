---
"@plainworks/std": minor
---

Add the shared contracts sibling packages meet through:

- **`std/seam`:** a `Telemetry` seam (`start` an operation, then `finish` or `fail` it, or record an `event`) with `noopTelemetry` and `toTelemetryFailure`, and a `CacheInvalidator` seam that invalidates by key, partial or exact, and can cancel the refetches.
- **`std/emitter`:** `createEmitter`, one synchronous emitter for the kit. A throwing listener never stops the others.
- **`std/resilience`:** `createBoundedQueue` takes `onDrop`, so every item the overflow policy discards is observable.

`redact` now masks only real JWTs (`eyJ…`), so dotted values such as hostnames stay readable.
