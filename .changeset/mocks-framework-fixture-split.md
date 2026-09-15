---
"@plainworks/mocks": minor
---

Split the reusable mock-building framework from the demo domain at the import site. The main
`@plainworks/mocks` entry now exposes framework primitives only — entity factories, the in-memory
store, CRUD handler generation, the control plane, the REST filter dialect, and the query/fixture
utilities. The concrete demo domain (users, orders, products, tasks, content, notifications,
settings, dashboard) and the `createMockApi()` graph that wires it together now live behind a new
`@plainworks/mocks/domain` entry, so it is clear in every import which half you are using.

This is a breaking move: `createMockApi`, the seeded entity factories, and the demo domain types now
import from `@plainworks/mocks/domain` instead of `@plainworks/mocks`. The `./server` and
`./vite-plugin` entries are unchanged.
