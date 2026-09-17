# @plainworks/testkit

> Shared, deterministic test harnesses and seam fakes for testing plainworks packages.

Client component tests import `renderA11y` and `expectNoAxeViolations` from `@plainworks/testkit/client`. The helper runs axe against the rendered container and reports rule identifiers for actionable failures.

Part of the [plainworks](../../README.md) kit.

## Install

```sh
bun add @plainworks/testkit
```

## Usage

```ts
import { ok } from "@plainworks/std"
import {
  manualClock,
  seededRandom,
  fakeAuthHeaderProvider,
  fakeSchema,
  guardSchema,
  createEmitter,
  recordEvents,
  expectOk,
  expectErr,
  deferred,
  flushMicrotasks,
} from "@plainworks/testkit"

// Deterministic time for anything built on the `Clock` seam.
const clock = manualClock(0)
clock.advance(1000)

// Seeded, reproducible randomness.
const rng = seededRandom(42)
rng.int(1, 6)

// Header-only auth double for the auth seam.
const auth = fakeAuthHeaderProvider({ headers: { Authorization: "Bearer test" } })

// A controllable Standard Schema for validated-boundary tests. `fakeSchema` drives accept /
// reject / transform directly; `guardSchema` builds one from a type-guard predicate.
const schema = guardSchema(
  (v): v is { id: string } =>
    typeof v === "object" && v !== null && typeof (v as { id?: unknown }).id === "string",
)

// Assert on a `Result` from `@plainworks/std`.
expectOk(ok(42)) // === 42; throws a typed PlainError on an Err
```

Server-safe only: this package pulls in no DOM or React code.

## Connect testing — `@plainworks/testkit/connect`

A network-free, host-independent subpath for testing Connect-RPC usage. It ships the shared proto fixture plus an in-memory transport built on Connect's own `createRouterTransport`, so a test drives real RPC wiring without a server. The Connect/protobuf libraries are **optional peer dependencies**, and the subpath is a separate tsdown entry — so non-Connect consumers of `@plainworks/testkit` neither install nor bundle them.

```ts
import {
  createFakeConnectTransport,
  EchoService,
  failUnary,
  Code,
} from "@plainworks/testkit/connect"

// Register canned responders, then hand `transport` to the code under test.
const fake = createFakeConnectTransport(EchoService)
  .unary(EchoService.method.echo, () => ({ message: "pong" }))
  .unary(EchoService.method.mutate, failUnary(Code.Unavailable))

const transport = fake.transport // built lazily on first read — register responders first

// Assert against recorded calls (method, wire headers, decoded input).
expect(fake.calls[0]?.header.get("authorization")).toBe("Bearer …")
```

- **`createFakeConnectTransport(service)`** — a `Transport` that routes to canned unary/streaming responders and records every call. A responder that must vary across attempts (fail-then-succeed for a retry test) is a stateful closure; a slow response awaits an injected `delay` inside the responder.
- **`failUnary(code, message?)`** — a responder that always fails with a typed `ConnectError`, for error-mapping and retry-classification tests.
- **Interceptor builders** — `fakeUnaryRequest` / `fakeUnaryResponse` / `fakeStreamRequest` drive an `Interceptor` directly (no transport) with a controllable `next`.
- **Shared fixture** — `EchoService` + typed `echoRequest`/`echoResponse`/`countRequest`/`countResponse` factories, generated from `proto/plainworks/testkit/v1/echo.proto`.

The proto is the source of truth; regenerate the checked-in `*_pb.ts` with `bun run gen:proto` (dev-only buf + `protoc-gen-es` — build, typecheck, and test never need buf).

## Streaming transport double — `fakeStreamTransport`

A scripted `StreamTransportFactory` for testing anything built on the `@plainworks/std` stream seam — a channel, an app's live view, or an integration flow — without SSE or WebSocket sockets. You drive each connection attempt by hand: open it, push frames, then end it cleanly or with an error. It honors the abort seam like a real transport, so reconnect, resume-from-cursor, and teardown all exercise the same double.

```ts
import { fakeStreamTransport } from "@plainworks/testkit"

const transport = fakeStreamTransport()
const channel = createChannel({ transport: transport.factory /* ... */ })

const attempt = transport.current // the live attempt
attempt.open() // the consumer sees the stream open
attempt.frame({ data: "hello" }) // push a frame
attempt.endError(new Error("drop")) // or endOk() to close cleanly

// The consumer resumes with the last cursor it saw:
expect(transport.attempts[1]?.context.lastEventId).toBe("42")
transport.assertClosed() // throws if any attempt leaked (never torn down)
```

## OpenID Provider double — `createMockIdp`

A deterministic, in-process OpenID Provider for testing an OIDC adapter end to end. It mints **real, JWKS-verifiable** tokens with `jose`, so the adapter runs its genuine discovery, PKCE, nonce, and token-verification path — only the network is faked (no MSW, no sockets). It exposes the `fetch` seam the adapter consumes plus an `authorize` helper that stands in for the user-agent's visit to the authorization endpoint, and it drives the failure paths: `failNextTokenExchange`, replayed codes, PKCE-verifier mismatch, and `idTokenNonceOverride` for a replay test.

```ts
import { createMockIdp } from "@plainworks/testkit"

const idp = await createMockIdp({ claims: { email: "user@idp.test" } })
// Configure the adapter's `fetch` seam with `idp.fetch`, then, after building the authorization URL:
const { callbackUrl } = idp.authorize(authorizationUrl) // redirect-back URL with code + state
```
