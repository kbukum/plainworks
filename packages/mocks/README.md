# @plainworks/mocks

> Reusable MSW mock-building primitives for plainworks tests — compose them to mock your own API.

Part of the [plainworks](../../README.md) kit.

## Install

```sh
bun add @plainworks/mocks
```

## What's here

The root exports the latency prelude. Each larger concern has one named subpath: `./data`, `./handlers`, `./fixture`, `./query`, `./filter`, `./control`, `./dispatch`, `./lifecycle`, `./stream`, and `./idp`. The `./vite-plugin` entry serves any MSW handler set over real HTTP.

Want a worked example rather than building from scratch? The kit's dev-only `@plainworks/demo` fixtures package wires these primitives into a full commerce/SaaS mock graph (`createMockApi()`), and is what the showcase and integration tests run against.

## Usage

### Wire failure fixtures

`@plainworks/mocks/failure` exports `wireFailures` and `failureSource`. The corpus pins an immutable `kbukum/gokit` revision and a SHA-256 digest per source file. It includes problem JSON, serialized protobuf status, and Connect JSON; optional debug JSON is not a decoder input.

```sh
bun run --filter @plainworks/mocks fixtures:check --source=/path/to/gokit
bun run --filter @plainworks/mocks fixtures:sync --source=/path/to/gokit
```

To update the corpus, change the pinned revision in `scripts/sync-failures.ts`, sync, and run the HTTP/RPC contract tests. The importer reads committed Git objects, never dirty working files. Client-only adversarial cases live in `@plainworks/connect/testing`.

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
  frame: (seq) => ({ type: "task.upserted", data: JSON.stringify({ id: `task-${seq % 5}` }) }),
})
```

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
```
