---
"@plainworks/testkit": minor
---

Time is injected as `clock?: Clock` everywhere: the browser gate and ui-capture runtimes, and flow runs no longer take a `now` function. `manualClock` reads its start time and `set` values through std's `parseTimestamp`, so `set` also takes an ISO instant, and it rejects a non-finite time or duration.
