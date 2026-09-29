# @plainworks/observability

> Telemetry, logging, error-reporting, and Web Vitals with safe platform defaults

Part of the [plainworks](../../README.md) kit.

## Install

```sh
bun add @plainworks/observability
```

## Usage

Each concern has its own import path, and none locks you into a vendor.

| Import | What it gives you |
|---|---|
| `@plainworks/observability` | `createTelemetry`: the `Telemetry` seam from `@plainworks/std/seam`, written to a logger. |
| `@plainworks/observability/logging` | `createLogger` and `createConsoleLogger`: a structured logger that redacts every record. |
| `@plainworks/observability/reporting` | `createErrorReporter`: one seam that fans errors out to the backends you register. |
| `@plainworks/observability/vitals` | The DOM-free Web Vitals shapes and `rateWebVital`. |
| `@plainworks/observability/client` | `observeWebVitals`, the browser collector. |

**Telemetry for every transport.** Build one `Telemetry` and pass it to each transport that accepts it, such as the HTTP client. Operations and events land in your logger, named after OpenTelemetry conventions.

```ts
import { createTelemetry } from "@plainworks/observability"
import { createConsoleLogger } from "@plainworks/observability/logging"
import { createHttpClient } from "@plainworks/http"

const telemetry = createTelemetry({ logger: createConsoleLogger({ base: { service: "web" } }) })
const http = createHttpClient({ baseUrl: "/api", telemetry })
```

**Structured, redacting logger.** Every record passes through defense-in-depth redaction before it reaches a sink. Recognizable token shapes and sensitively named fields are masked; callers must name or redact bare secrets at the source.

```ts
import { createConsoleLogger } from "@plainworks/observability/logging"

const log = createConsoleLogger({ base: { service: "api" } })
log.info("request handled", { route: "/orders", authorization: "******" })
// → fields.authorization is "[REDACTED]"
```

**Error reporting.** Register your own backends (a Sentry-style service, an internal collector) and report through one seam. Each backend synchronously admits events to its own bounded delivery lifecycle. Rejected admission is isolated and never reaches the caller.

```ts
import { createErrorReporter } from "@plainworks/observability/reporting"

const reporter = createErrorReporter({ backends: [myBackend] })
reporter.report(error, { severity: "error", tags: { route: "/orders" } })
```

**Web Vitals.** The browser collector sends measurements to an injected callback.

```ts
import { observeWebVitals } from "@plainworks/observability/client"

// In a client effect — the returned teardown flushes and disconnects.
const stop = observeWebVitals((metric) => log.info("web-vital", { ...metric }))
```

## Runtime primitives

The neutral entries (everything except `./client`) are host-free. The console logger resolves the host console only when it writes its first record, and consumers can inject another console. The `./client` collector uses an injectable `PerformanceObserver` and becomes an inert no-op when the runtime does not provide one. See [`docs/architecture.md › Axis 2`](../../docs/architecture.md) for the runtime model.
