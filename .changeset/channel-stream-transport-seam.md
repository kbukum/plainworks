---
"@plainworks/std": minor
"@plainworks/channel": minor
"@plainworks/testkit": patch
---

Move the streaming transport seam down to `@plainworks/std` and ship a shared transport test double.

- **The transport contract now lives in `std`.** The frame and transport interfaces a streaming connection is built on are neutral, host-independent shapes, so they belong in the foundation next to the other shared seams. `@plainworks/std` now owns `StreamFrame`, `StreamTransport`, `StreamTransportContext`, and `StreamTransportFactory`; `@plainworks/channel` re-exports them and consumes them unchanged. This is the rename of channel's former `ChannelFrame`/`Transport` names — the wire behaviour is identical.
- **One transport double for every consumer.** `@plainworks/testkit` adds `fakeStreamTransport()` — a scripted transport whose attempts you drive by hand: open the stream, push frames, end it cleanly or with an error, and assert the consumer tore every attempt down. It honours the abort seam like a real SSE or WebSocket adapter, so a channel, an app, or an integration test all exercise reconnect, resume-from-cursor, and teardown against the same double instead of hand-rolling one per test.
