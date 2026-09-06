/**
 * Structured filter query shapes, vendored into `@plainworks/mocks` so the mock handlers can parse
 * PostgREST/Supabase-style query params without depending on a higher layer. The canonical home for
 * a shared filter language is revisited when the `ui` package lands.
 */

/** Comparison operators supported by the mock filter language. */
export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "nin"
  | "like"
  | "ilike"
  | "null"
  | "notNull"

/** A single field/operator/value predicate. */
export interface FilterCondition {
  field: string
  operator: FilterOperator
  value: string | string[] | null
}

/** A decoded set of predicates to apply to a collection. */
export interface FilterQuery {
  conditions: FilterCondition[]
}
