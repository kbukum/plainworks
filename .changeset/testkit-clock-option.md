---
"@plainworks/testkit": minor
---

Time is injected as `clock?: Clock` everywhere: `createMockIdp`, the browser gate and ui-capture runtimes, and flow runs no longer take a `now` function. `manualClock` parses timestamps through std's `parseTimestamp`.
