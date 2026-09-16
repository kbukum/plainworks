# @plainworks/observability

> Logging, error-reporting, and Web Vitals seams with safe platform defaults

Part of the [plainworks](../../README.md) kit.

## Install

```sh
bun add @plainworks/observability
```

## Usage

Three seams, each with a safe platform default and no vendor lock-in.

**Structured, redacting logger.** Every record passes through defense-in-depth redaction before it reaches a sink. Recognizable token shapes and sensitively named fields are masked; callers must name or redact bare secrets at the source.

```ts
import { createConsoleLogger } from "@plainworks/observability"

const log = createConsoleLogger({ base: { service: "api" } })
log.info("request handled", { route: "/orders", authorization: "Bearer …" })
// → fields.authorization is "[REDACTED]"
```

**Error reporting.** Register your own backends (a Sentry-style service, an internal collector) and report through one seam. Each backend synchronously admits events to its own bounded delivery lifecycle. Rejected admission is isolated and never reaches the caller.

```ts
import { createErrorReporter } from "@plainworks/observability"

const reporter = createErrorReporter({ backends: [myBackend] })
reporter.report(error, { severity: "error", tags: { route: "/orders" } })
```

**Web Vitals.** The DOM-free metric shapes and `rateWebVital` ship from the `.` entry. The browser collector lives under `./client` and sends measurements to an injected callback.

```ts
import { observeWebVitals } from "@plainworks/observability/client"

// In a client effect — the returned teardown flushes and disconnects.
const stop = observeWebVitals((metric) => log.info("web-vital", { ...metric }))
```

## Runtime primitives

The neutral (`.`) entry is host-free. The console logger resolves the host console only when it writes its first record, and consumers can inject another console. The `./client` collector uses an injectable `PerformanceObserver` and becomes an inert no-op when the runtime does not provide one. See [`docs/architecture.md › Axis 2`](../../docs/architecture.md) for the runtime model.
