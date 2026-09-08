// Re-export-only barrel for the list-query wire concern — the canonical PostgREST-style list-read
// contract plainworks defines. The typed param builder serializes to the query string a backend
// implementing this contract parses; the envelope types decode the `{ data, pagination, facets }` JSON
// it returns. The matching cache-key derivation lives in `@plainworks/query` (the L2 cache side).
export type { FilterOperator } from "./operators"
export {
  FILTER_OPERATOR_TOKENS,
  FILTER_OPERATOR_TOKENS_LONGEST_FIRST,
  filterOperatorFromToken,
} from "./operators"
export type {
  ListFilter,
  ListMembershipFilter,
  ListQueryParams,
  PresenceFilter,
  ScalarFilter,
  SortDirection,
} from "./params"
export { buildListQuery } from "./params"
export type { CursorInfo, CursorResult, Facets, PageInfo, PaginatedResult } from "./result"
