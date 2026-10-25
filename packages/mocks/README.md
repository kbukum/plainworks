# @plainworks/mocks

> Reusable MSW mock-building primitives for plainworks tests — compose them to mock your own API.

Part of the [plainworks](../../README.md) kit.

## Install

```sh
bun add @plainworks/mocks
```

## What's here

The root exports the latency prelude. Each larger concern has one named subpath: `./connect`, `./data`, `./handlers`, `./fixture`, `./query`, `./filter`, `./control`, `./dispatch`, `./lifecycle`, `./stream`, `./idp`, and `./scope`. The `./vite-plugin` entry serves any MSW handler set over real HTTP.

Want a worked example rather than building from scratch? The kit's dev-only `@plainworks/demo` fixtures package wires these primitives into a full commerce/SaaS mock graph (`createMockApi()`), and is what the showcase and integration tests run against.

## Usage

### Standard failures

`@plainworks/mocks/failure` builds RFC 9457 problems: `problemJson(status, init)` for an `application/problem+json` body and `problemFrame(status, init)` for an SSE `failure` event. Both are plain data, so any runtime can serve them. `init` sets `type`, `title`, `detail`, `instance` and extension members. Client-only adversarial Connect cases live in `@plainworks/connect/testing`.

### Connect unary mocks

`@plainworks/mocks/connect` mocks Connect unary methods over the JSON codec. It needs the optional peer `@bufbuild/protobuf`.

```ts
import { connectFailure, connectUnary } from "@plainworks/mocks/connect"

const handler = connectUnary(
  UserService.method.getUser,
  ({ id }) => users.get(id) ?? connectFailure("not_found"),
  { validate: (schema, message) => validator.check(schema, message) },
)
```

- `connectUnary` decodes the input, runs the handler, and encodes the output. It answers malformed JSON with `invalid_argument` and a body over `maxBodyBytes` (1 MiB by default) with `resource_exhausted`.
- `validate` checks the input and the output. Invalid input gets `invalid_argument` with the violation in the message. Invalid output is a fixture drift and gets an `internal` error that names the method, so a stale fixture never reaches the client silently.
- `gate` answers before the body is read, for denied or unavailable endpoints.
- `connectFailure(code, options)` sends a Connect error for a canonical code with its HTTP status. Options add the standard `google.rpc` details: one `errorInfo` (reason, domain, metadata), BadRequest `violations`, and a RetryInfo `retryAfterMs`. `connectUnary` refuses a `maxBodyBytes` that is not a positive safe integer.

### Live convergence fixtures

`@plainworks/mocks/stream` exports `protocolFixture`, `convergenceFixture` and `listsFixture`: the channel protocol's SSE frames, acknowledgement and snapshot operation sequences, and list shapes. They are the channel's own contract; any server that implements it must produce them.

### Entity mocks

Compose the primitives to mock an entity end to end — a seeded factory feeds an in-memory store, CRUD handlers expose it over REST with filtering/sorting/pagination, and (optionally) the Vite plugin serves the handler set over real HTTP in dev:

```ts
import { createLatency } from "@plainworks/mocks"
import { createEntityFactory, createFixtureSources, createStore } from "@plainworks/mocks/data"
import { nowISOString, randomInt } from "@plainworks/mocks/fixture"
import { createCrudHandlers, type InputSpec } from "@plainworks/mocks/handlers"

interface Todo {
  id: string
  title: string
  priority: number
  createdAt: string
}

type TodoInput = { title: string; priority: number }

// 1. A seeded fixture stream (same seed → identical fixtures; defaults to the wall clock).
const sources = createFixtureSources(1, "todos")

// 2. A factory that builds one Todo (seeded) or accepts POSTed input.
const factory = createEntityFactory<Todo, TodoInput>({
  create: (input) => ({
    id: sources.nextId("todo"),
    title: input?.title ?? "Untitled",
    priority: input?.priority ?? randomInt(sources.rng, 1, 5),
    createdAt: nowISOString(sources.clock),
  }),
  defaultSeedCount: 10,
})

// 3. An in-memory store seeded from the factory.
const store = createStore(() => factory.getSeeded())

// 4. Client-writable fields; bodies failing this decode are rejected with 400.
const inputSpec: InputSpec<TodoInput> = { title: { kind: "string" }, priority: { kind: "number" } }

// 5. The `/api/todos` CRUD handlers — hand these to MSW or the Vite plugin.
const handlers = createCrudHandlers<Todo, TodoInput>({
  basePath: "/api/todos",
  entityName: "Todo",
  store,
  createEntity: factory.create,
  latency: createLatency(0),
  clock: sources.clock,
  inputSpec,
  searchFields: ["title"],
  filterFields: ["priority"],
  sortFields: ["title", "priority", "createdAt"],
})
```

Serve any handler set from Vite in dev, so the browser makes real HTTP requests to your fixtures:

```ts
// vite.config.ts
import { mockServerPlugin } from "@plainworks/mocks/vite-plugin"

mockServerPlugin(handlers)
```

Bind an MSW server to any runner that provides lifecycle hooks:

```ts
import { installMockServer } from "@plainworks/mocks/lifecycle"
import { afterAll, afterEach, beforeAll } from "vitest"

const server = installMockServer({ handlers, hooks: { beforeAll, afterEach, afterAll } })
```

Stand in for a live SSE or WebSocket backend with a scheduled stream. It sends one frame per interval and plugs in wherever a `StreamTransportFactory` goes:

```ts
import { createScheduledStream } from "@plainworks/mocks/stream"

const transport = createScheduledStream({
  intervalMs: 2000,
  epoch: "00000000000000000000000000000001",
  frame: (seq) => ({ type: TaskChangedSchema.typeName, data: JSON.stringify({ id: `task-${seq % 5}` }) }),
})
```

With an `epoch`, the factory emits `connected` before application frames and uses canonical sequence IDs across attempts. A resumed connection sends `replayExpired` reset because this mock retains no replay. The frame callback may be async and receives the attempt signal, letting a demo update its authoritative backend before announcing a change.

### Data scopes

When many tests share one host, give each test its own mock backend. `createMockScopes` keeps one instance per scope, named by the `plainworks-mock-scope` request header (`MOCK_SCOPE_HEADER`). A request without the header uses one default instance, so local development is unchanged. A malformed scope id throws `MockScopeError`, never a fallback to shared data. It holds 32 scopes by default and evicts the least recently used.

```ts
import { createMockScopes, scopedMockHandlers } from "@plainworks/mocks/scope"

const scopes = createMockScopes({ create: () => createMockApi() })
mockServerPlugin(scopedMockHandlers(scopes, (api) => api.handlers))
```

`scopedMockHandlers` answers a malformed scope with a `400` problem and serves `DELETE /mock/scope` to release one. The control client's `releaseScope()` calls it. A host whose server code reads the mock backend over HTTP must forward the header on those reads. Don't honor the header in production.

A few behaviors worth knowing:

- **Input is validated at the boundary** — a malformed body or query param returns `400`.
- **Latency is off by default** for deterministic tests. Set a fixed delay with `createLatency(ms)`, or use `createMockControl` and `createMockControlClient` from `./control`.
- **Handlers match any origin**, so the same set intercepts both same-origin requests and the absolute URLs `msw/node` uses.
- **Everything is a factory** — importing this module creates no stores, workers, or other state.

## OpenID Provider double — `createMockIdp`

A deterministic, in-process OpenID Provider for testing an OIDC adapter end to end. It mints **real, JWKS-verifiable** tokens with `jose`, so the adapter runs its genuine discovery, PKCE, nonce, and token-verification path — only the network is faked (no MSW, no sockets). It exposes the `fetch` seam the adapter consumes plus an `authorize` helper that stands in for the user-agent's visit to the authorization endpoint, and it drives the failure paths: `failNextTokenExchange`, replayed codes, PKCE-verifier mismatch, and `idTokenNonceOverride` for a replay test.

```ts
import { createMockIdp } from "@plainworks/mocks/idp"

const idp = await createMockIdp({ claims: { email: "user@idp.test" } })
// Configure the adapter's `fetch` seam with `idp.fetch`, then, after building the authorization URL:
const { callbackUrl } = idp.authorize(authorizationUrl) // redirect-back URL with code + state
idp.close()
```

Inject `createMemoryMockIdpState()` to share fixture data across independently created providers. Each provider borrows that state; `idp.close()` closes only the provider, while the caller closes shared custody. Authorization remains synchronous. Code consumption is atomic after PKCE verification, including concurrent requests.

For state that survives restart, implement `MockIdpState` in your host. `decodeMockIdpData` validates a persisted document and `emptyMockIdpData` creates the initial one, so any storage can hold it. Mutations must be synchronous and atomic. Run `createMockIdpStateCases()` from your own test runner against your state to prove handles share signing identity, one-time codes, PKCE, refresh rotation and failure controls, and that failed transactions roll back. The Next reference host shows one example with encrypted local SQLite in `apps/next-host/src/server/custody`. This is fixture custody, never a production identity system.

State is bounded to 128 pending codes (five minutes), 128 refresh grants (one-hour absolute lifetime), eight retained signing keys, and a 64KiB serialized document. A new pending code fails when 128 are waiting. A new refresh grant evicts the oldest one when 128 are live, the way real providers retire old grants, so a long shared run never stops accepting sign-ins. `state.reset()` clears grants and failure controls, fences pending token publication, and retains the signing identity and monotonic identifiers. Reset only the explicitly owned worker's state before sign-in; normal restart is not reset.
