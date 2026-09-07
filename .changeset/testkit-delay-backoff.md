---
"@plainworks/testkit": patch
---

Add `autoBackoffDelay` — a deterministic `Delay` harness where a short retry-backoff wait elapses instantly (recorded in `waits`) while a long per-attempt timeout wait stays suspended until its signal aborts. It complements `manualDelay` (which fires each wait by hand) for tests that want backoff to proceed automatically, so retry/timeout suites reuse one shared fake instead of hand-rolling it.
