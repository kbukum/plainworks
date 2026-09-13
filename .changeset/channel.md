---
"@plainworks/channel": patch
"@plainworks/std": patch
"@plainworks/testkit": patch
---

Add `@plainworks/channel`, a streaming-connection core with pluggable transports and a typed event router. It runs anywhere; the React hooks live on a separate DOM-free import.

You create a channel with a factory that owns its lifecycle — connect, open, reconnect, close — and reuses the shared resilience helpers for reconnect timing and for deciding when to stop (for example, it won't reconnect forever on an auth failure). It heals itself: backoff resets only after a connection has been stable for a while, each attempt is time-bounded, and a stalled stream is dropped. Auth is header-only and re-applied on every reconnect.

Transports are injected, not hard-wired — Server-Sent Events and WebSocket adapters are included. The event router decodes incoming frames and fans them out with backpressure, dropping a bad frame instead of tearing down the stream. A typed error covers the failure cases.

`@plainworks/std` exposes its timer-duration guard, and `@plainworks/testkit` adds a manual delay so tests control reconnect timing exactly.
