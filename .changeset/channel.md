---
"@plainworks/channel": patch
"@plainworks/std": patch
"@plainworks/testkit": patch
---

Add `@plainworks/channel` (L2) — a host-independent streaming-connection core with pluggable transport adapters and a typed event router. The server-safe `.` entry references no host global; the React hooks live at a DOM-free `./client` entry.

`createChannel` is a per-stream **factory** (no module singleton) that owns lifecycle and stable-open gating while delegating resilience to `std`:

- **Lifecycle** — `idle → connecting → open → reconnecting → closing → closed`, with idempotent `connect`/`close`, readable `status`, and header-only resume via `Last-Event-ID`.
- **Reconnect from `std`** — jittered backoff, the retry ceiling, and fatal-vs-retryable classification all come from `std` resilience; a `401`/`403` stops the loop instead of reconnecting forever.
- **Self-healing timing** — backoff resets only after a connection stays open for `minUptimeMs` (no flap storm), a connect timeout bounds each attempt, and an optional idle-read timeout aborts a half-dead stream that stops delivering without erroring.
- **Header-only auth** — the credential seam attaches headers on every attempt, re-resolved on reconnect; a token never lands in a URL.

Transports are injected `TransportFactory` seams, never hard imports: `createSseTransport` (platform `fetch` + `Response.body` + `eventsource-parser`, with the whole decode buffer bounded and `retry:`/`Last-Event-ID` honored) and `createWsTransport` (reconnect-aware with an app-level heartbeat and a header-capable socket factory).

The **event router** (`createEventRouter`) decodes frames to `{ type, payload, id }` and fans them out to sinks through a `std` bounded queue for backpressure; a decode/validation failure is reported and the frame dropped rather than tearing down the stream. `createStateSink` folds events through the `std` `StateSource` contract. `createChannelContext` provides a `ChannelProvider` plus DOM-free `useChannel`/`useChannelStatus`/`useChannelEvent`/`useAnyChannelEvent` hooks. Failures surface as a typed `ChannelError` (`channel/config` · `connect` · `protocol` · `closed`).

`@plainworks/std` gains exported `assertTimerMs`/`MAX_TIMER_MS` (the shared host-timer duration guard, previously private), and `@plainworks/testkit` gains `manualDelay()` — a deterministic `Delay` whose waits fire only when the test says so.
