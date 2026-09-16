# @plainworks/demo

> The kit's demo domain — a fake commerce/SaaS fixture set and the mock API graph that wires it, built on `@plainworks/mocks` primitives.

Dev-only and never published. It exists so the reference app (`apps/showcase`) and the cross-package integration tests (`internal/integration`) run against one shared, realistic backend instead of copying fixtures per host.

## What's here

`@plainworks/demo` (the `.` entry) is the domain: seeded entity factories and types for users, orders, products, tasks, content, notifications, and settings, plus `createMockApi()` — one call builds a complete, isolated MSW mock graph (stores, latency, control state, and every handler closing over them). Nothing lives in module scope, so parallel servers never observe or reset each other.

`@plainworks/demo/server` is the Node harness: `createMockServer(api)` and `createMockServerHandle(options)` pair the demo graph with an `msw/node` server for tests.

```ts
import { createMockServerHandle } from "@plainworks/demo/server"

const { server, api } = createMockServerHandle({ seed: 42 })
server.listen({ onUnhandledRequest: "error" })
// ... run tests against /api/users, /api/products, /api/dashboard/*, ...
api.reset() // re-seed stores and clear control state between cases
server.close()
```

To build a mock backend for *your own* entities, reach for the primitives in [`@plainworks/mocks`](../../packages/mocks/README.md) instead — this package is one worked example of composing them.
