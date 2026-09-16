---
"@plainworks/observability": patch
"@plainworks/http": patch
"@plainworks/std": patch
---

Add `@plainworks/observability` (L1), a host-independent package with three seams, each carrying a safe platform default and no vendor lock-in.

- **Logging** — a minimal typed `Logger` and a redacting `createConsoleLogger` default. Every record's message and fields pass through `std` `redact`, so a token-shaped string or a sensitively-named field is masked before it reaches a sink; the host `console` is resolved lazily as an injectable seam, and per-request `child` loggers carry base fields. No module-level state.
- **Error reporting** — a `createErrorReporter` hub that normalizes and redacts each occurrence, then fans it out to explicitly registered bring-your-own backends (Sentry-style services are BYO — no global registry; duplicate backend names are rejected). Backends synchronously enqueue into their own bounded delivery lifecycle; `report` returns a typed result of delivered and failed backends (and pushes failures to `onBackendError`), so a lost report is never silent and never blocks the others or reaches the caller.
- **Web Vitals** — DOM-free metric shapes and a pure `rateWebVital` ship from the neutral `.` entry; the browser collector (`observeWebVitals`) lives behind `./client`, reports through the same seam, injects its `PerformanceObserver`, and is an inert no-op where none exists.

`@plainworks/std` now provides a recursively inert, descriptor-safe error snapshot (cycle- and depth-guarded, preserving non-`Error` discriminants) for observability boundaries, and `@plainworks/http` reuses it for redacted interceptor errors.
