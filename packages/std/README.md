# @plainworks/std

> Zero-dependency, host-independent standard-library primitives and shared contracts for plainworks.

Part of the [plainworks](../../README.md) kit. `std` is the bottom of the layer graph (L0): every other package depends on it, and it depends on nothing. Zero runtime dependencies, no React or DOM — it runs anywhere (Node, edge, RSC, browser).

## Install

```sh
bun add @plainworks/std
```

## What's inside

- **Errors** — `PlainError` (typed base that preserves `cause` and carries a `kind` discriminant), `ensureError`, `getErrorMessage`.
- **Result** — `Result<T, E>` with `ok` / `err` / `isOk` / `isErr` / `unwrap` / `unwrapOr`.
- **Guards** — `isDefined`, `isRecord`, `isNonEmptyString`, `hasProperty`.
- **Assertions** — `assert`, `assertNever`.
- **Resilience** — one shared failure taxonomy and the drivers built on it:
  - `classifyStatus` / `classifyError` / `isRetryable` — map an HTTP status or thrown value to a retry disposition; `NetworkError` (transport-wrapped network failure) and `StatusError` (status-carrying HTTP failure) are the typed shapes it classifies.
  - `nextBackoff` / `defaultBackoff` — bounded exponential backoff with `none` / `full` / `decorrelated` jitter.
  - `withTimeout` / `TimeoutError`, `createDeadline` / `combineSignals` / `AbortError`, `systemDelay` — per-attempt budgets (retryable) vs. overall deadlines (fatal).
  - `runWithRetry` / `RetryError` — policy-driven retries for idempotent operations only.
  - `createCircuitBreaker` / `CircuitOpenError` — clock-injected breaker that fails fast and probes recovery.
  - `createBoundedQueue` — bounded FIFO hand-off with explicit overflow policy and bounded, cancellable consumers.
- **Pipeline** — `composeInterceptors` / `pipeValues`, the generic handler/interceptor combinators.
- **Redaction** — `redact`, structural secret stripping for safe logging.
- **Randomness** — `systemRandom` and seedable `createSeededRandom` for deterministic tests.
- **Utilities** — `randomId` / `idempotencyKey` (Web Crypto UUID), `systemClock` + the `Clock` seam.
- **Shared seams** — the single source of truth higher layers implement:
  - `AuthHeaderProvider` / `AuthHeaders` — the header-only auth seam.
  - `PlainEvent` / `Listener` / `Subscription` — the event and teardown shapes.

## Usage

```ts
import { type Result, err, ok, PlainError } from "@plainworks/std"

function parsePort(raw: string): Result<number> {
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return err(new PlainError("config/port", `not a valid port: ${raw}`))
  }
  return ok(port)
}
```

Compose the resilience primitives to protect a call path — a per-attempt timeout inside a bounded, jittered retry inside a circuit breaker, with failures expressed as the typed shapes the shared classifier understands:

```ts
import {
  createCircuitBreaker,
  defaultBackoff,
  NetworkError,
  runWithRetry,
  StatusError,
  withTimeout,
} from "@plainworks/std"

const breaker = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 5_000 })

async function getUser(id: string): Promise<unknown> {
  return breaker.execute(() =>
    runWithRetry(
      (_attempt, signal) =>
        withTimeout(
          async (attemptSignal) => {
            let response: Response
            try {
              response = await fetch(`/api/users/${encodeURIComponent(id)}`, { signal: attemptSignal })
            } catch (error) {
              throw new NetworkError("Failed to fetch", { cause: error })
            }
            if (!response.ok) {
              throw new StatusError(response.status)
            }
            return response.json()
          },
          2_000,
          { signal },
        ),
      { maxAttempts: 3, backoff: defaultBackoff, idempotent: true },
    ),
  )
}
```

Strip secrets before anything reaches a log sink. Redaction is defense-in-depth, not data minimization — log an allowlisted set of fields you know are safe rather than a whole request, and let `redact` catch a stray credential that slips in:

```ts
import { redact } from "@plainworks/std"

logger.info(
  redact({
    method: request.method,
    path: new URL(request.url).pathname,
    userId: session.userId,
    authorization: request.headers.get("authorization"), // masked to "[REDACTED]"
  }),
)
```
