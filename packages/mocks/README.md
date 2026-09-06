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

Request bodies and query params are validated at the boundary (400 on malformed input); latency is off by default for deterministic tests — enable it per server via `createMockApi({ latency })` or at runtime through the `/mock/latency` endpoint. Handlers match on any origin, so the same set intercepts same-origin requests and the absolute URLs used by `msw/node`.
