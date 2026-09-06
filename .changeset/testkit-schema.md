---
"@plainworks/testkit": patch
---

Add shared Standard Schema fakes to `@plainworks/testkit`: `fakeSchema` (a configurable `StandardSchemaV1` that accepts, rejects with issues, or transforms, sync or async) and `guardSchema` (a schema built from a type-guard predicate), plus `fakeFetch` — a deterministic `fetch` fake that plays back a queued sequence of outcomes (a response, an error, or a never-settling `"hang"` for a timeout) and records every call, typed purely against `@plainworks/std` web shapes so it is assignable to any transport's `fetch` seam. Tests across `http` and future transports validate the shared validation seam and drive the network boundary through these instead of hand-rolling a `~standard` object or a one-off `fetch` stub per test.
