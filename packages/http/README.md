# @plainworks/http

Host-independent REST/JSON client with response validation, interceptors, and bounded retries.

Part of the [plainworks](../../README.md) kit.

## Install

```sh
bun add @plainworks/http
```

## Runtime primitives

The neutral core runs on servers, edge hosts, workers, RSC, browsers, and React Native without DOM or Node types. It uses standard value primitives and an injectable `WebFetch` seam. The default uses platform `fetch`; an unavailable implementation raises `http/network`. See [runtime primitives](../../docs/architecture.md#runtime-primitives).

## Server-safe core (`.`)

`createHttpClient` returns an isolated client with its own URL, interceptors, and retry policy. Create clients at the appropriate request or application boundary; do not share request-specific state through a singleton.

For tests or wrappers, pass `options.fetch` using the `WebFetch` contract from `@plainworks/std/web`. Forward DOM/undici fetch through that function shape rather than casting its host-specific types.

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
2. **Run the interceptor chain** — telemetry, your own middleware, then auth injection.
3. **Apply resilience** — a per-attempt timeout and bounded, jittered retry for idempotent methods.
4. **Decode the body** to an untrusted `unknown`, then **validate** it with the request's `schema` to produce `HttpResponse<T>`, where `data` is `T | undefined` (a `204`/no-content response has no body).

A non-2xx response or a network failure throws a typed `HttpError`. An `application/problem+json` body is read as an RFC 9457 problem: the HTTP `status` sets the canonical `code` and retry verdict, a non-`about:blank` `type` becomes the `reason`, and string extension members become `metadata`. A malformed problem stays operational (`http/decode`). A backend with its own extension members passes a `failures` decoder in the client options. `Retry-After` becomes a minimum delay in milliseconds, never shortened to `backoff.maxMs`. The total `budgetMs` bounds admission, attempts, and waits; a minimum beyond it stops retries.

### Resource methods

`request` returns status, headers, final URL, and decoded body. `get`, `post`, `put`, `patch`, and `delete` return the body directly, validated when a schema is supplied or `undefined` for no content.

```ts
const client = createHttpClient({ baseUrl: "https://api.example.com" })

const user = await client.get("/users/42", { schema: z.object({ id: z.string() }) })
// user is `{ id: string } | undefined`

await client.delete("/users/42")
```

The retry policy admits `GET`, `PUT`, and `DELETE`. `POST` and `PATCH` require an idempotency key and an endpoint that guarantees server-side deduplication. Generate one key per logical write and reuse it across attempts; a server that ignores the header can duplicate a partial success.

```ts
import { idempotencyKey } from "@plainworks/std/random"

const key = idempotencyKey() // generate once per logical write, reuse across retries
await client.post("/orders", { body: { sku: "abc" }, idempotencyKey: key })
```

### Validation seam

Bodies decode to `unknown`. Supply a [Standard Schema](https://standardschema.dev) validator to validate and infer the response type; failures raise `http/validate` with issues preserved as the cause. Without a schema, narrow the value yourself. `unsafePassthrough<T>()` from `@plainworks/std/seam` explicitly opts out at an audited call site; it is not the default.

### Interceptors and telemetry

An interceptor wraps the request/response flow. The client composes them outermost-first, with the built-in auth injector nearest the wire so it re-runs on every retry attempt. Import the interceptor types from `@plainworks/http/interceptor`.

```ts
import { createHttpClient } from "@plainworks/http"
import { createTelemetry } from "@plainworks/observability"

const client = createHttpClient({
  baseUrl: "https://api.example.com",
  authProvider: async () => ({ Authorization: `Bearer ${await token()}` }),
  telemetry: createTelemetry({ logger }),
})
```

Auth is **header-only** — a token never lands in a URL. Pass any `Telemetry` from `@plainworks/std/seam` to see each attempt as an `http.client.request` operation with OpenTelemetry attributes (`http.request.method`, `url.full`, `server.address`, `http.response.status_code`). A status of 400 or above fails with the status code as its type. Headers and bodies are never reported, and URLs are cut to scheme, host and path.

### Codec seam

For opaque browser sessions, inject `protectedSession` from `@plainworks/auth/session` into the client options. It bounds authoritative admission, sends CSRF headers only, and cancels the whole request through body decoding when the session ends. Terminal authentication and session-store failures invalidate the shared lifetime. Keep public clients separate; this downward `std` seam never makes HTTP import auth.

Bodies pass through a `BodyCodec`. `jsonCodec` is the default; supply your own — or `createJsonCodec({ maxBytes })` to tune the ceiling — to speak another wire format without touching the client.

- **Encoding** a non-serializable value (cyclic, `BigInt`, a bare function or symbol) raises a typed `http/encode` error, not a raw `TypeError`.
- **Decoding** runs through a bounded streaming reader that refuses a body larger than `maxBytes` (10 MiB default) and honors the attempt's timeout/abort signal — so a stalled or dishonest body can neither hang the call nor exhaust memory.

## React binding (`./client`)

`HttpClientProvider` hands one client to your components, and `useHttpClient` reads it. You build the client, so it is never a module-level singleton. It is pure React context with no DOM, so it also runs on React Native.

```tsx
"use client"
import { createHttpClient } from "@plainworks/http"
import { HttpClientProvider } from "@plainworks/http/client"

export function Providers({ origin, children }: { origin: string; children: React.ReactNode }) {
  const [client] = useState(() => createHttpClient({ baseUrl: origin }))
  return <HttpClientProvider client={client}>{children}</HttpClientProvider>
}
```

## List reads (`buildListQuery`) — the PostgREST list contract

plainworks defines a canonical **PostgREST/Supabase-style** list-read wire: filter, sort, paginate (offset **or** cursor), free-text search, eager-load, and facet. `buildListQuery` serializes a typed `ListQueryParams` into exactly that query string, so the frontend speaks the same list language a backend implementing this contract parses — no stringly-typed caller API. The result flows through the same URL safety, credential guard, auth injection, timeout, retry, and codec as any other request.

The list dialect lives on **`@plainworks/http/list`**: the param builder, the canonical operator-token table (`FILTER_OPERATOR_TOKENS`, `filterOperatorFromToken`), and the value escape/parse **codec** (`escapeScalarValue`/`escapeListValue` and their inverses `unescapeValue`/`parseDelimitedList`) — so a server-side implementer of the contract (like `@plainworks/mocks`) parses the same tokens and escapes the builder serializes from, without pulling in the fetch client. Serializer and parser read one codec, so they cannot drift.

```ts
// A backend parsing the same wire the builder emits (`role=not.in.(admin,editor)`).
import { filterOperatorFromToken, parseDelimitedList, splitOperatorToken } from "@plainworks/http/list"

const resolved = splitOperatorToken("not.in.(admin,editor)")
const operator = resolved && filterOperatorFromToken(resolved.token) // "nin"
const values = resolved && parseDelimitedList(resolved.rest.slice(1, -1)) // ["admin", "editor"]
```

```ts
import { buildListQuery } from "@plainworks/http/list"
import { z } from "zod"

// Provide your own Standard Schema validator matching the envelope shape.
const paginatedResultSchema = <T>(row: z.ZodType<T>) =>
  z.object({
    data: z.array(row),
    pagination: z.object({
      page: z.number(),
      pageSize: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
  })

const users = await client.get("/users", {
  query: buildListQuery({
    filters: [
      { field: "status", op: "eq", value: "active" },
      { field: "role", op: "in", value: ["admin", "editor"] },
    ],
    page: 1,
    pageSize: 20,
    sortBy: "createdAt",
    order: "desc",
    search: "ada",
  }),
  schema: paginatedResultSchema(z.object({ id: z.string(), name: z.string() })),
})
// ?status=eq.active&role=in.(admin,editor)&page=1&pageSize=20&sortBy=createdAt&order=desc&search=ada
```

Each filter serializes to `field=op.value`; a field carrying several filters becomes a repeated key (a range: `price=gte.10&price=lte.20`). A value shape that contradicts its operator (a scalar for `in`, an array for `eq`, a value on `null`) is a caller fault rejected as a fatal `http/request` error, never mis-serialized.

| Operator | Wire token | Value |
|---|---|---|
| `eq` `neq` `gt` `gte` `lt` `lte` `like` `ilike` | same token | scalar |
| `in` `nin` | `in.(a,b,c)` · `not.in.(a,b,c)` | array |
| `null` `notNull` | `is.null` · `not.is.null` | none |

Responses decode through the request's schema into the envelope `@plainworks/std/list` defines: `PaginatedResult<T>` (offset — `{ data, pagination: { page, pageSize, total, totalPages }, facets? }`) or `CursorResult<T>` (cursor — `nextCursor`/`prevCursor` instead of page counts). Cursor mode is the default for infinite lists, since an offset drifts as rows change between fetches. A request selects cursor mode by the **presence of `cursor`** — an empty `cursor=` asks for the first page (otherwise a cursor first page and a defaulted offset page 1 would be identical on the wire). The matching **cache-key** derivation lives in [`@plainworks/query`](../query/README.md) — the L2 half of the same contract.

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
