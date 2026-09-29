---
"@plainworks/http": minor
---

Replace the `observability` and `redact` client options and the logging interceptor with one `telemetry` option on the std `Telemetry` seam. Each request reports an `http.client.request` operation with OpenTelemetry HTTP attributes, and a failed status or thrown error fails it. Interceptors move to `@plainworks/http/interceptor`, and the list types are no longer re-exported: import them from `@plainworks/std/list`.
