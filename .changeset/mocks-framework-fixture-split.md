---
"@plainworks/mocks": minor
---

Reduce `@plainworks/mocks` to reusable mock-building primitives only. The package now ships the framework you compose to mock your own API — entity factories, the in-memory store, CRUD handler generation, the control plane, the REST filter dialect, and the query/fixture utilities — plus the `./vite-plugin` dev middleware.

This is a breaking move: the ready-made demo domain (users, orders, products, tasks, content, notifications, settings, dashboard) and the `createMockApi()` graph that wires it together no longer publish here. The `./domain` and `./server` entries have been removed — a published package should ship reusable primitives, not one app's fixtures. The demo domain now lives in the kit's dev-only `@plainworks/demo` package, which the showcase and integration tests consume.

`InputSpec` is now generic over your entity input (`InputSpec<T>`): each field's spec `kind` is checked against that field's type, so pairing a numeric field with a string spec (or any other mismatch) fails at compile time instead of laundering the wrong runtime type into your entity.
