---
"@plainworks/channel": minor
---

The SSE transport now owns its response body: an abort, a buffer overflow, or a throwing listener cancels the stream, and every exit releases the reader. The event router reports every event its full buffer drops through `onDrop` and an optional `telemetry` seam, and the `reject` policy drops instead of throwing into the channel. Redesign the entry points so each concern has its own path: `.` holds the channel lifecycle and `ChannelError`, and the router and transports move to `./events` and `./transport`. The stream-transport types come only from `@plainworks/std/seam`, and `resolveUrl` is no longer public.
