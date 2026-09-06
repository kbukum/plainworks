---
"@plainworks/http": patch
---

Add `@plainworks/http` (L1) — a host-independent typed fetch client that higher transports (rest, graphql) build on. The server-safe `.` entry pulls in no DOM or Node types.

`createHttpClient` is a per-request **factory** (no module singleton, nothing leaks across SSR requests) that depends only on the platform `fetch`, injectable via `options.fetch`. Each `request` runs a fixed pipeline:

- **Safe URL build** — rejects credentials smuggled into the query string or userinfo, and dot-segment paths that escape the base; the final URL is re-checked at the transport so an interceptor cannot reintroduce a credential or rewrite across origins while carrying one.
- **Interceptor chain** — logging → caller interceptors → header-only auth injection, re-applied on every attempt.
- **Resilience** — a per-attempt timeout (covering body decode) and bounded, jittered retry for idempotent methods only, honoring a clamped `Retry-After` hint.
- **Typed failures** — every fault maps to an `HttpError` (`http/status` · `network` · `timeout` · `unsafe-url` · `request` · `encode` · `decode` · `validate`) carrying `category`/`retryable`/`retryAfterMs` and preserving cause; on exhausted retries the underlying failure surfaces, not the wrapping `RetryError`.
- **Validated boundary** — the body decodes through a pluggable `BodyCodec` (`jsonCodec` default, with a bounded streaming reader that caps and cancels an oversized or stalled body) to an untrusted `unknown`, then the request's Standard Schema validator produces `HttpResponse<T>`. There is no silent `as T`: trusting the wire is an explicit opt-in via `unsafePassthrough<T>()`.

Redacted observability hooks receive structured request/response/error records with sensitive headers, URLs, and error internals stripped before they cross the boundary, reusing the shared `std` credential-key vocabulary so the rules never drift.
