import type { FilterOperator } from "@plainworks/std"

/**
 * Structured filter query shapes for the mock handlers. The operator vocabulary itself is **not**
 * vendored: it is the canonical contract owned by `@plainworks/std` (the lowest layer, which both
 * the `http` serializer and this parser bind to), re-exported here so the mock's filter types and
 * its consumers share one source of truth and cannot drift.
 */

/** Comparison operators supported by the mock filter language — the canonical `std` contract. */
export type { FilterOperator }

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
