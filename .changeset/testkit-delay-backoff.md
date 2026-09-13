---
"@plainworks/testkit": patch
---

Add a deterministic delay helper to `@plainworks/testkit` where retry backoff elapses instantly while a long timeout stays suspended until it's aborted. It complements the existing manual delay for tests that want backoff to proceed on its own, so retry and timeout tests reuse one shared fake instead of hand-rolling it.
