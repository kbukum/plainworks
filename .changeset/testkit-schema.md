---
"@plainworks/testkit": patch
---

Add shared testing fakes to `@plainworks/testkit`: a configurable validator (accept, reject, or transform, sync or async), a validator built from a type guard, and a deterministic `fetch` fake that plays back a queued sequence of outcomes — including a response, an error, or a hang for testing timeouts — and records every call. Tests reuse these instead of hand-rolling a validator or a one-off `fetch` stub each time.
