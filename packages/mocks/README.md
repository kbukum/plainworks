# @plainworks/mocks

> Shared MSW request handlers, seeded data factories, and mock-server setup for plainworks tests and the showcase.

Part of the [plainworks](../../README.md) kit.

## Install

```sh
bun add @plainworks/mocks
```

## Usage

Everything starts from `createMockApi()` — one call builds a complete, isolated mock graph (seeded fixtures, stores, latency, control state, and the MSW handlers closing over them). Nothing lives in module scope, so parallel servers never observe or reset each other. With the same `seed` and a fixed `clock`, fixtures — content, ids, and timestamps — reproduce exactly, independent of request order.

```ts
// Node tests (Vitest, etc.)
import { createMockApi } from "@plainworks/mocks"
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
import { createMockApi } from "@plainworks/mocks"
import { mockServerPlugin } from "@plainworks/mocks/vite-plugin"

mockServerPlugin(createMockApi().handlers)
```

The server-safe `.` entry also exposes the per-domain fixture sources, entity factories, settings storage, the PostgREST/Supabase-style filter parser, and the pure filter/sort/paginate utilities:

```ts
import { createFixtureSources, createTaskFactory, parseApiParams } from "@plainworks/mocks"

const tasks = createTaskFactory(createFixtureSources(7, "tasks")).createMany(3)
```

A few behaviors worth knowing:

- **Input is validated at the boundary** — a malformed body or query param returns `400`.
- **Latency is off by default** for deterministic tests; enable it per server via `createMockApi({ latency })` or at runtime through the `/mock/latency` endpoint.
- **Handlers match any origin**, so the same set intercepts both same-origin requests and the absolute URLs `msw/node` uses.
