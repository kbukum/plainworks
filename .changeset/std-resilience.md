---
"@plainworks/std": patch
---

Add the shared resilience and pipeline helpers to `@plainworks/std`, so every transport reuses one implementation instead of writing its own.

- Classify failures and decide what is safe to retry.
- Back off between retries with jitter, and cap the total wait.
- Apply timeouts and deadlines, and combine cancellation signals.
- Retry only operations that are safe to repeat.
- A bounded queue for backpressure.
- Redaction for safe logging, so secrets never reach the logs.

The clock, randomness, and delays are all injectable, so tests are deterministic.
