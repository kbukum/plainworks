# @plainworks/mocks

> Reusable mock-building primitives — plus a ready-made demo domain — built on MSW for plainworks tests and the showcase.

Part of the [plainworks](../../README.md) kit.

## Install

```sh
bun add @plainworks/mocks
```

## Which half do you want?

The package has two halves, split at the import site. The main `@plainworks/mocks` entry is the **framework**: entity factories, an in-memory store, CRUD handler generation, a mock control plane, the PostgREST-style filter dialect, and the query/fixture utilities — the pieces you compose to mock *your own* API. The `@plainworks/mocks/domain` entry is a **ready-made demo domain**: a fake commerce/SaaS fixture set (users, orders, products, tasks, content, notifications, settings, dashboard) and the `createMockApi()` graph that wires it together — what the showcase and the kit's own integration tests run against. Reach for `/domain` to get a working API instantly; reach for the main entry to build one.

## Usage

The ready-made demo domain starts from `createMockApi()` — one call builds a complete, isolated mock graph (seeded fixtures, stores, latency, control state, and the MSW handlers closing over them). Nothing lives in module scope, so parallel servers never observe or reset each other. With the same `seed` and a fixed `clock`, fixtures — content, ids, and timestamps — reproduce exactly, independent of request order.

```ts
// Node tests (Vitest, etc.)
import { createMockApi } from "@plainworks/mocks/domain"
import { createMockServer } from "@plainworks/mocks/server"

const api = createMockApi({ seed: 42 }) // fresh, isolated mock graph
const server = createMockServer(api)

server.listen({ onUnhandledRequest: "error" }) // fail loudly on unmatched requests
// ... run tests against /api/users, /api/products, /api/dashboard/*, ...
api.reset() // re-seed stores and clear control state between tests
server.close()
```

`createMockServerHandle()` builds the api and its server together when a test needs both halves — the `server` to install as the network boundary and the `api` to inspect stores or `reset()` between cases:

```ts
import { createMockServerHandle } from "@plainworks/mocks/server"

const { server, api } = createMockServerHandle({ seed: 42 })
beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  server.resetHandlers()
  api.reset()
})
afterAll(() => server.close())
```

```ts
// Vite dev-server middleware
import { createMockApi } from "@plainworks/mocks/domain"
import { mockServerPlugin } from "@plainworks/mocks/vite-plugin"

mockServerPlugin(createMockApi().handlers)
```

The main `.` entry exposes the framework primitives you compose to mock your own entities — generic fixture sources, the entity factory and store, CRUD handler generation, the PostgREST/Supabase-style filter parser, and the pure query (filter/sort/paginate) and fixture (seeded random/id/date) utilities:

```ts
import { createEntityFactory, createFixtureSources, parseApiParams } from "@plainworks/mocks"
```

A few behaviors worth knowing:

- **Input is validated at the boundary** — a malformed body or query param returns `400`.
- **Latency is off by default** for deterministic tests; enable it per server via `createMockApi({ latency })` or at runtime through the `/mock/latency` endpoint.
- **Handlers match any origin**, so the same set intercepts both same-origin requests and the absolute URLs `msw/node` uses.
