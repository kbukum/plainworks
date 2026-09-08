---
"@plainworks/std": patch
---

Home the **abstract** list-read contract in `@plainworks/std` (L0) — and only the abstract contract. A `std/list` concern folder now defines the typed request params (`ListQueryParams`, `ListFilter` and its `ScalarFilter`/`ListMembershipFilter`/`PresenceFilter` variants, `SortDirection`, `FilterValue`), the response envelopes (`PageInfo`, `PaginatedResult`, `CursorInfo`, `CursorResult`, `Facets`), and the operator **vocabulary** `FilterOperator` (the operator *names* as a concept). These are pure, host-independent shapes, so `http`, `query`, and `mocks` bind to one lowest-common-layer source of truth.

The REST **wire dialect** is deliberately *not* here: the operator→token map, the longest-first token ordering, `filterOperatorFromToken`, and the escape/parse codec are a PostgREST URL concern and live in `@plainworks/http`, not at L0. `std` owns the abstract idea of an operator; `http` owns how it serializes.
