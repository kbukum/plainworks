---
"@plainworks/devtools": patch
"@plainworks/std": patch
---

Add `@plainworks/devtools`, a development-only runtime inspector built on a host-independent, serializable session protocol.

- **A session aggregates sources** — you register `Source`s with a `DevtoolsSession`; each one publishes summary events and status indicators, and the session assigns a per-source monotonic sequence, retains everything in bounded rings, and forwards typed messages over an in-memory bridge to a connected client port.
- **Private and serializable by default** — every source payload crosses a defense-in-depth sanitize boundary that masks sensitive keys and token-shaped strings, caps depth and collection size, coerces unsupported values to safe markers, and never throws. Command input goes through a stricter gate that refuses anything non-serializable.
- **A versioned wire protocol** — messages and requests carry a protocol version and are validated on the way in; a wrong version or a malformed shape is refused with a typed error, while unknown fields on a known message degrade safely so an older peer keeps working.
- **Typed, cancellable requests** — a client can fetch on-demand detail and run source commands; results come back as typed results that never reject, so cancellation, supersession, and session disposal are ordinary values rather than thrown errors.
- **Explicit lifecycle** — sources, in-flight requests, retention, and the bridge all have clear ownership and teardown, with source failures isolated so one broken source never tears down the session.
- **Bounded redaction** — `@plainworks/std` can cap the entries inspected in each collection while preserving descriptor-safe secret masking.
