---
"@plainworks/mocks": patch
---

Add `./stream` with `createScheduledStream`, a demo stream transport that sends one frame per interval. Use it to stand in for a real SSE or WebSocket backend while you build. It honors cancellation and takes an injected delay, so tests run without real timers.
