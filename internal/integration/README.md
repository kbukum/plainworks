# @plainworks/integration

Dev-only, never published. **Integration** tests that assemble the published `@plainworks/*` surfaces the way a consumer does — real packages wired together, their **edges faked** (the MSW mock service, in-memory doubles). See the [Testing section of the architecture doc](../../docs/architecture.md#testing) for the taxonomy and why these tests live outside the package graph.

A test here depends **downward** on many packages (`http`, `query`, `mocks`, `std`) and nothing depends on it. It compiles and runs against each dependency's built `dist`, so `test` and `typecheck` require the dependencies to be built first (`turbo` handles this via `^build`).

```sh
turbo run test --filter @plainworks/integration
```

## How it is organized

- **By concern, one scenario per file.** Concern folders live directly under the package (no `test/`, `smoke/`, or kind sub-layer — the whole package *is* integration by scope). The **filename is the scenario** it proves; **depth** (smoke → thorough) is a property of the file, not a folder.
- Add a scenario by dropping a `<scenario>.test.ts` into the matching concern folder (e.g. `list/`). Add a concern by creating a new folder next to `list/`. The vitest `include` globs every `*/**/*.test.ts`, so no config change is needed.
- Split into a **separate package** only when tests need different machinery or scope — a real browser/server/DB **e2e** suite would become a future `internal/e2e` (Playwright), not another folder here.

### `list/` — the PostgREST list contract, assembled

| Scenario | What it proves |
|---|---|
| `read-into-cache.test.ts` | An offset read flows http → mock → query and lands in the cache under the derived key; a second read is served from cache. |
| `empty-page.test.ts` | A filter matching nothing yields a real empty envelope (`total: 0`), cached — no success-shaped fallback. |
| `infinite-list.test.ts` | Cursor pages accumulate under one key and stay disjoint (no drift). |
| `wire-serialization.test.ts` | The builder ↔ parser ↔ envelope agreement: `buildListQuery` emits the exact wire, the mock parses it, the envelope is exactly `{ data, pagination, facets }` — scalar + sort + paging, multi-segment tokens (`in`/`nin`/`not.is.null`), and facet roll-up. |
| `cache-key.test.ts` | `listQueryKey` is order-independent over the filter set and distinct on any change. |
| `cursor-paging.test.ts` | Cursor forward paging round-trips through the mock without overlap. |
| `server-error.test.ts` | A bodyless backend error surfaces as a typed `HttpError` through http → query; the query rejects, the cache stays empty, and it recovers when the failure clears. |
| `aborted-read.test.ts` | An aborted read rejects and never populates the cache. |

Scenario files import list **types** (`PaginatedResult`, `CursorResult`, `ListQueryParams`) from `@plainworks/query` — the facade a consumer reaches for — and the URL serializer `buildListQuery` from `@plainworks/http`. No scenario imports a list type from `@plainworks/http`.
