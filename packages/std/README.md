# @plainworks/std

> Zero-dependency, host-independent standard-library primitives and shared contracts for plainworks.

Part of the [plainworks](../../README.md) kit. `std` is the bottom of the layer graph (L0): every other package depends on it, and it depends on nothing. Zero runtime dependencies, no React or DOM — it runs anywhere (Node, edge, RSC, browser).

## Install

```sh
bun add @plainworks/std
```

## What's inside

Like a language's standard library, `std` has a small **prelude** and a set of **modules**. The prelude, `@plainworks/std`, holds what every module needs: typed errors, `Result`, guards and assertions. Each concern is a module on its own subpath, so the import says what you're using: `import { readBoundedText } from "@plainworks/std/web"`. Every name has exactly one import path.

| Import | What it gives you |
|---|---|
| `std` (prelude) | `PlainError` (a typed base that keeps `cause` and a `kind`), `ensureError`, `getErrorMessage`, `createErrorSnapshot` (safe to log), `Result` with `ok` / `err` / `isOk` / `isErr` / `unwrap` / `unwrapOr`, the guards `isDefined` / `isRecord` / `isNonEmptyString` / `hasProperty` / `isOneOf` / `isPositiveInteger` / `isNonNegativeInteger`, and `assert` / `assertNever`. |
| `std/resilience` | One failure taxonomy (`classifyError`, `classifyStatus`, `NetworkError`, `StatusError`), bounded jittered backoff, `withTimeout` and deadlines, `runWithRetry` for idempotent calls, and `createBoundedQueue` (with an `onDrop` hook so loss is observable). |
| `std/failure` | `RemoteFailure`, application `FailureCode`, semantic `Violation`, and operational `FailureDecodeError`. Transport status stays separate; delays use milliseconds. |
| `std/pipeline` | `composeInterceptors` and `pipeValues`. |
| `std/privacy` | `redact` and `isSensitiveKey`, for stripping secrets before logging. |
| `std/random` | `systemRandom`, seedable `createSeededRandom` for tests, `randomId` and `idempotencyKey`. |
| `std/time` | The `Clock` seam with `systemClock` and `fixedClock`, `parseTimestamp`, and calendar-valid `parseRfc3339` (Unix milliseconds; leap-second notation is rejected). An API that reads time takes `clock?: Clock`, never a bare `now` function. |
| `std/encoding` | base64url, `utf8ByteLength`, and JSON: the `Json` type, `isJson`, `stringifyJson` (throws `JsonEncodeError` instead of dropping values), `escapeJsonForHtml`, and `toBoundedJson` for capped diagnostic copies. |
| `std/web` | Body reads under a byte cap (`readBoundedBytes`, `readBoundedText`, `PayloadTooLargeError`), cookie parsing (`readCookie`, `parseCookieHeader`), `resolveFetch`, structural header copying with `createHeaders`, and the self-contained `Web*` platform types (`WebFetch`, `WebHeaders`, `WebAbortSignal`, …) that let a neutral package name `fetch` or `Headers` in its API. |
| `std/list` | The protocol-independent list contract: `ListQueryParams`, the `ListFilter` union and operator vocabulary, and the `PaginatedResult` / `CursorResult` envelopes. `@plainworks/http` owns the REST wire dialect. |
| `std/emitter` | `createEmitter`, the one in-memory listener set: subscribe, emit, `listenerCount`, and `clear`. A throwing listener never stops the others. |
| `std/seam` | The shared seams higher layers implement: `AuthHeaderProvider`, the event shapes (`PlainEvent`, `Listener`, `Subscription`), `Telemetry` (operations and events, with `noopTelemetry` and `toTelemetryFailure`), `CacheInvalidator` with `CacheTarget`, `StateSource` with `createSourceReconciler`, and the [Standard Schema](https://standardschema.dev) seam with `validateWithSchema`. |

## Runtime primitives

`std/list` also exports `decodeOffsetList` and `decodeCursorList`. They accept generated list responses, require pagination at the decode boundary, and preserve extra response fields. Missing metadata throws a typed `ListDecodeError`; absent next/previous cursors are valid end-of-list markers, while null cursors are rejected.

`std/resilience` exposes `retryDelay` for long-lived owners such as channels. It applies the same minimum-delay policy as unary retries without imposing a unary lifetime on a healthy stream. `std/web` exposes `cancelReadable` for teardown: cancellation closes the reader immediately without waiting on optional source cleanup, so a stalled cleanup cannot hide an abort or size-limit error.

`std` is a **neutral** package — no React, no DOM, no Node builtins — so it runs on every target runtime (server, edge, workers, RSC, browser, React Native). It touches only **universal** platform primitives directly (`AbortController` / `AbortSignal`, `TextDecoder`, and the WHATWG value types it models as the self-contained `Web*` structural contract). Its host-resolved primitives are looked up lazily at call time, never on import: `crypto.randomUUID` (backing `randomId`) throws a typed `std/unsupported` error when the runtime lacks it, and `resolveFetch` falls back to the platform `fetch` only when no `fetch` is injected. `Math.random` backs the non-cryptographic `systemRandom` seam. See [`docs/architecture.md › Runtime primitives`](../../docs/architecture.md#runtime-primitives) for the universal-vs-injected primitive contract.

## Usage

```ts
import { err, isPositiveInteger, ok, PlainError, type Result } from "@plainworks/std"

function parsePort(raw: string): Result<number> {
  const port = Number(raw)
  if (!isPositiveInteger(port) || port > 65_535) {
    return err(new PlainError("config/port", `not a valid port: ${raw}`))
  }
  return ok(port)
}
```

Compose the resilience primitives to protect a call path — a per-attempt timeout inside a bounded, jittered retry, with failures expressed as the typed shapes the shared classifier understands:

`runWithRetry` has a total `budgetMs` (30 seconds by default), including admission and waits. A server minimum is never capped downward: if it cannot fit, retries stop. Explicit false and terminal authentication cannot be overridden by a custom predicate.

```ts
import {
  defaultBackoff,
  NetworkError,
  runWithRetry,
  StatusError,
  withTimeout,
} from "@plainworks/std/resilience"

async function getUser(id: string): Promise<unknown> {
  return runWithRetry(
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
  )
}
```

Strip secrets before anything reaches a log sink. Redaction is defense-in-depth, not data minimization — log an allowlisted set of fields you know are safe rather than a whole request, and let `redact` catch a stray credential that slips in:

```ts
import { redact } from "@plainworks/std/privacy"

logger.info(
  redact({
    method: request.method,
    path: new URL(request.url).pathname,
    userId: session.userId,
    authorization: request.headers.get("authorization"), // masked to "[REDACTED]"
  }),
)
```
