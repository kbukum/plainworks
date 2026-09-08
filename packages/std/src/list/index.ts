// Re-export-only barrel for the protocol-agnostic list contract — the **abstract** list-read contract
// plainworks defines: the operator vocabulary (`FilterOperator`), the typed request params, and the
// `{ data, pagination, facets }` response envelopes. Pure value types, no host and no wire dialect, so
// `http` (serializer), `query` (cache keys), and `mocks` (parser) all bind to one abstract source of
// truth. The REST wire dialect (operator→token map, escape/parse codec) lives in `@plainworks/http`;
// the URL serializer `buildListQuery` lives there too.
export type {
  FilterOperator,
  FilterValue,
  ListFilter,
  ListMembershipFilter,
  ListQueryParams,
  PresenceFilter,
  ScalarFilter,
  SortDirection,
} from "./params"
export type { CursorInfo, CursorResult, Facets, PageInfo, PaginatedResult } from "./result"
