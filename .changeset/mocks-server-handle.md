---
"@plainworks/mocks": patch
---

Add `createMockServerHandle()` to `@plainworks/mocks/server` and bind the mock's offset envelope to the canonical list contract, completing the mock-service integration layer.

- **Paired harness** — `createMockServerHandle(options)` builds a seeded `MockApi` and its MSW node server together and returns both, so a cross-package test gets the `server` to install as the network boundary and the `api` to inspect stores or `reset()` between cases without hand-wiring the two factories. The test still owns the `listen`/`resetHandlers`/`close` lifecycle, keeping MSW decoupled from any test framework.
- **One envelope source of truth** — the mock's `PaginationResult` now types its `pagination` block as `PageInfo` from `@plainworks/std`, so the offset envelope the mock emits can never drift from the `PaginatedResult<T>` a consumer decodes. The envelope shape is part of the abstract list contract in `@plainworks/std`; the REST wire dialect the parser uses lives in `@plainworks/http/list`.
