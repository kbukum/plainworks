# @plainworks/mocks

> Reusable MSW mock-building primitives for plainworks tests — compose them to mock your own API.

Part of the [plainworks](../../README.md) kit.

## Install

```sh
bun add @plainworks/mocks
```

## What's here

The `@plainworks/mocks` entry is the **framework**: entity factories, an in-memory store, CRUD handler generation, a mock control plane, the PostgREST-style filter dialect, and the pure query (filter/sort/paginate) and fixture (seeded random/id/date) utilities — the pieces you compose to mock *your own* API. The `@plainworks/mocks/vite-plugin` entry is a Vite dev-server middleware that serves any MSW handler set over real HTTP.

Want a worked example rather than building from scratch? The kit's dev-only `@plainworks/demo` fixtures package wires these primitives into a full commerce/SaaS mock graph (`createMockApi()`), and is what the showcase and integration tests run against.

## Usage

Compose the primitives to mock an entity end to end — a seeded factory feeds an in-memory store, CRUD handlers expose it over REST with filtering/sorting/pagination, and (optionally) the Vite plugin serves the handler set over real HTTP in dev:

```ts
import {
  createCrudHandlers,
  createEntityFactory,
  createFixtureSources,
  createLatency,
  createStore,
  nowISOString,
  randomInt,
  type InputSpec,
} from "@plainworks/mocks"

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

A few behaviors worth knowing:

- **Input is validated at the boundary** — a malformed body or query param returns `400`.
- **Latency is off by default** for deterministic tests. Set a fixed delay with `createLatency(ms)`, or add the control plane (`createMockControl`) to drive it per server over `/mock/latency`. `createMockControlClient` is the typed, validating client for those `/mock/*` routes.
- **Handlers match any origin**, so the same set intercepts both same-origin requests and the absolute URLs `msw/node` uses.
- **Everything is a factory** — importing this module creates no stores, workers, or other state.
