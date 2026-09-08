---
"@plainworks/query": patch
---

Make `@plainworks/query` the one-stop import root for list DX. Its internal list types now come from `@plainworks/std` (not `@plainworks/http`), and it re-exports the list contract types (`PaginatedResult`, `CursorResult`, `ListQueryParams`, `PageInfo`, `ListFilter` and variants, `SortDirection`, `FilterOperator`, `Facets`) from its public surface, so a consumer imports list types from the same package that provides `listQueryOptions`. The URL serializer `buildListQuery` stays an `@plainworks/http` import. `@plainworks/query` no longer depends on `@plainworks/http`.
