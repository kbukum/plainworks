---
"@plainworks/devtools": patch
"@plainworks/connect": patch
---

Add optional `@plainworks/devtools/http`, `@plainworks/devtools/connect`, `@plainworks/devtools/channel`, and `@plainworks/devtools/observability` adapter subpaths — separately importable runtime-flow instrumentation, so an app pays no dependency or bundle cost for a transport it doesn't use (`@plainworks/http`, `@plainworks/connect`, `@connectrpc/connect`, `@plainworks/channel`, and `@plainworks/observability` are optional peers).

- **One correlation model for request/response transports** — `createHttpSource` and `createConnectSource` each return a devtools interceptor to place in the client and a source to register. Every exchange becomes a start/settle pair on the timeline with a shared outcome vocabulary (`ok`/`error`/`timeout`/`canceled`) and an aggregate indicator, so HTTP and Connect RPC read the same way. Streaming Connect calls track message counts and a definite close. The interceptor preserves host behavior — it observes and re-throws, never altering the result.
- **Channel lifecycle and frame health** — `createChannelSource` composes (never replaces) a channel's `onStatusChange`/`onError` to record status transitions and count reconnects, and `observe` subscribes to frames for counts and last-event-id. Frame `data` never crosses the boundary — only a `{ type, bytes, id? }` summary.
- **A local mirror of the observability pipeline** — `createObservabilitySource` returns a log sink, reporter backend, and Web Vital reporter to add *beside* the operational ones. Each only reads already-redacted output and is wrapped so a devtools-side fault is swallowed: a failing tee never alters the operational sink, the report result, or the application path.
- **Private and bounded by default** — URLs are sanitized (userinfo, query, and fragment stripped, so a token in a query string never leaks); only metadata crosses the protocol, with headers and log fields exposed solely through an explicit allowlist behind on-demand detail; high-frequency logs and frames coalesce per interval; and every adapter takes a consumer-provided `instance` label so multiple clients never collide or get guessed identities.
- **Accurate stream deadlines** — Connect idle timeouts abort the transport with a typed timeout reason, so inner instrumentation and the caller observe the same timeout outcome.
