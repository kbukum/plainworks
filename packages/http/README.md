# @plainworks/http

> Host-independent typed fetch client — interceptor pipeline, auth-header injection, safe URL building, a pluggable codec seam, and `std`-powered timeout/retry — that higher transports (rest, graphql) build on.

Part of the [plainworks](../../README.md) kit.

## Install

```sh
bun add @plainworks/http
```

## Runtime primitives

`http` is a **neutral (`.`)** package. It names the **universal** WHATWG value primitives directly — `Headers`, `URL` / `URLSearchParams`, `Response`, `TextDecoder`, `AbortController` — typed through the `std` `Web*` contract, so it imposes no DOM or Node types on a consumer. Its one **non-universal** primitive is `fetch`: an **injected seam** (`options.fetch`, a `FetchLike` narrowing of the `std` `WebFetch` contract) that defaults to the host's platform `fetch` and raises a typed `http/network` error when no `fetch` exists. No DOM or Node global is referenced, so it runs on server, edge, workers, RSC, the browser, and React Native. See [`docs/architecture.md › Axis 2`](../../docs/architecture.md) for the universal-vs-injected primitive contract.

## Server-safe core (`.`)

`createHttpClient` is a **factory**, never a module-level singleton — every call returns an isolated client with its own base URL, interceptors, and retry policy, so nothing leaks across SSR requests. It depends only on the platform `fetch` (injectable via `options.fetch` for tests), so the package pulls in no DOM or Node types and stays host-independent.

The default path takes the platform `fetch` with no injection and no cast. To swap it — a test double, an instrumentation or auth wrapper — pass `options.fetch` as a function written to the `WebFetch` contract (`(input, init) => Promise<WebResponse>` from `@plainworks/std`); that is the natural wrapper shape and needs no cast. A DOM/undici `fetch` is not *directly* assignable to the host-independent seam (its `RequestInit` names DOM-only shapes the kit refuses to depend on), so forward it through a one-line `WebFetch` function rather than passing it raw.

```ts
import { createHttpClient } from "@plainworks/http"
import { z } from "zod"

const client = createHttpClient({ baseUrl: "https://api.example.com" })

const user = await client.request({
  method: "GET",
  path: "/users/42",
  query: { include: "profile" },
  schema: z.object({ id: z.string() }),
})
// user.data is validated and typed `{ id: string } | undefined` — the schema runs at the trust
// boundary, and a 204/no-content response decodes to `undefined`.
```

Each `request` runs a fixed pipeline:

1. **Build the URL safely** — rejects any credential smuggled into the query string or URL userinfo.
2. **Run the interceptor chain** — auth injection, observability, and your own middleware.
3. **Apply resilience** — a per-attempt timeout and bounded, jittered retry for idempotent methods.
4. **Decode the body** to an untrusted `unknown`, then **validate** it with the request's `schema` to produce `HttpResponse<T>`, where `data` is `T | undefined` (a `204`/no-content response has no body).

A non-2xx response or a network failure throws a typed `HttpError` that preserves the cause and carries `category`, `retryable`, and any parsed `Retry-After` hint (clamped to `backoff.maxMs`).

### Validation seam

The response body crosses a trust boundary, so it is decoded to `unknown` and never silently cast to a caller-chosen `T`. Pass a `schema` — any [Standard Schema](https://standardschema.dev) validator (Zod, Valibot, ArkType, …) — and the client validates the decoded body and infers the response type from it; a validation failure raises a fatal `http/validate` error that preserves the issues as `cause`. Omit `schema` and `data` is the raw `unknown` for you to narrow. To opt explicitly out of validation — "I trust this wire" — pass `unsafePassthrough<T>()` from `@plainworks/std`; the unchecked cast then lives at that one audited call site, never as a hidden default. The seam is shared: future `rest`/`graphql` transports validate their payloads through the same `std` contract.

### Interceptors

An interceptor wraps the request/response flow. The client composes them outermost-first, with the built-in auth injector nearest the wire so it re-runs on every retry attempt.

```ts
import { createHttpClient } from "@plainworks/http"

const client = createHttpClient({
  baseUrl: "https://api.example.com",
  authProvider: async () => ({ Authorization: `Bearer ${await token()}` }),
  observability: { onRequest, onResponse },
})
```

Auth is **header-only** — a token never lands in a URL. Pass `observability` to receive structured request/response/error records; the client wires this logging interceptor outermost for you. Everything is redacted before it's emitted: sensitive headers are masked (tune via `redact`), URLs are cut to scheme + host + path (userinfo, query, and fragment stripped), and errors are scrubbed before reaching `onError`.

### Codec seam

Bodies pass through a `BodyCodec`. `jsonCodec` is the default; supply your own — or `createJsonCodec({ maxBytes })` to tune the ceiling — to speak another wire format without touching the client.

- **Encoding** a non-serializable value (cyclic, `BigInt`, a bare function or symbol) raises a typed `http/encode` error, not a raw `TypeError`.
- **Decoding** runs through a bounded streaming reader that refuses a body larger than `maxBytes` (10 MiB default) and honors the attempt's timeout/abort signal — so a stalled or dishonest body can neither hang the call nor exhaust memory.

## Typed errors

`HttpError` is the client's own typed failure family; `isHttpError` narrows it. Callers branch on its `kind` — exhaustive **for `HttpError`** — instead of inspecting strings:

| `kind` | Cause |
|---|---|
| `http/status` | a non-2xx response |
| `http/network` | a transport/connection failure |
| `http/timeout` | an attempt exceeded its per-attempt deadline |
| `http/unsafe-url` | a credential smuggled into the URL, or an interceptor rewrite across origins |
| `http/request` | a malformed request (e.g. a body on a `GET`/`HEAD`) |
| `http/encode` | the request body couldn't be serialized |
| `http/decode` | the response body couldn't be parsed |
| `http/validate` | the decoded body failed the request's schema |

Two failures deliberately fall **outside** this family and propagate unchanged: a caller-triggered cancellation rejects with the standard `AbortError` (so `signal`-based cancellation is not masked as a network fault), and any interceptor or codec you inject surfaces its own error type as-is. So catch `HttpError` for the client's contract, but do not assume every rejection is one.

Even when retries are exhausted the client surfaces the underlying failure (its typed `HttpError` — the `http/status`, `http/network`, `http/timeout`, … discriminant with its `status`/`category`), never the wrapping `RetryError`, so the failure a caller catches is always the real last one.
