// Re-export-only barrel for the HTTP list concern — the home of the PostgREST/Supabase REST **wire
// dialect** for the list contract, both directions. The *abstract* contract (operator vocabulary,
// request params, `{ data, pagination, facets }` envelopes) is defined once in `@plainworks/std`
// and surfaced here (facade) so a consumer imports the contract paired with its serializer.
// This package owns the REST codec: the operator↔token grammar, the escape/parse value codec, and
// the serializer `buildListQuery` — the same primitives a REST backend (e.g. `@plainworks/mocks`)
// binds to for parsing, so serializer and parser can never drift.
export type {
  CursorInfo,
  CursorResult,
  Facets,
  FilterOperator,
  FilterValue,
  ListFilter,
  ListMembershipFilter,
  ListQueryParams,
  PageInfo,
  PaginatedResult,
  PresenceFilter,
  ScalarFilter,
  SortDirection,
} from "@plainworks/std"
export { buildListQuery } from "./build"
export { escapeListValue, escapeScalarValue, parseDelimitedList, unescapeValue } from "./codec"
export {
  FILTER_OPERATOR_TOKENS,
  FILTER_OPERATOR_TOKENS_LONGEST_FIRST,
  filterOperatorFromToken,
  splitOperatorToken,
} from "./operators"
