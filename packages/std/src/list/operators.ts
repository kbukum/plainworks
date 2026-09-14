import type { FilterOperator, ListMembershipFilter, PresenceFilter, ScalarFilter } from "./params"

/** A value-less presence operator — the `op` of a {@link PresenceFilter}. */
export type PresenceOperator = PresenceFilter["op"]

/** A list-membership operator — the `op` of a {@link ListMembershipFilter}. */
export type ListOperator = ListMembershipFilter["op"]

/** A single-scalar comparison operator — the `op` of a {@link ScalarFilter}. */
export type ScalarOperator = ScalarFilter["op"]

// The canonical operator listings, `as const` so each keeps its exact literal tuple — the partition
// proof below reads these to detect an operator the arrays forgot to classify. The exported arrays
// alias them with an explicit `readonly …Operator[]` type, which both keeps the public shape stable
// and checks every entry belongs to its group.
const PRESENCE_OPERATOR_LIST = ["null", "notNull"] as const
const LIST_OPERATOR_LIST = ["in", "nin"] as const
const SCALAR_OPERATOR_LIST = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike"] as const

/** The presence operators, in a canonical order — value-less null/not-null checks. */
export const PRESENCE_OPERATORS: readonly PresenceOperator[] = PRESENCE_OPERATOR_LIST

/** The list-membership operators, in a canonical order — each takes a set of values. */
export const LIST_OPERATORS: readonly ListOperator[] = LIST_OPERATOR_LIST

/** The scalar-comparison operators, in a canonical order — each takes a single value. */
export const SCALAR_OPERATORS: readonly ScalarOperator[] = SCALAR_OPERATOR_LIST

// Compile-time proof the three listings enumerate the whole operator vocabulary: `_Classified` is
// the union of what the listings actually contain, so if a future `ListFilter` variant introduces
// an operator that no listing names, `_Unclassified` becomes non-`never` and this stops compiling —
// the scalar branch of a builder can never silently absorb an unclassified operator. Exported only
// so the proof counts as used; it is not re-exported from the package surface.
type _Classified =
  | (typeof PRESENCE_OPERATOR_LIST)[number]
  | (typeof LIST_OPERATOR_LIST)[number]
  | (typeof SCALAR_OPERATOR_LIST)[number]
type _Unclassified = Exclude<FilterOperator, _Classified>
type _AssertTrue<T extends true> = T
// The failing branch is `false`, not `never`: `never` satisfies the `T extends true` constraint, so
// an unclassified operator would slip through the guard silently. `false` makes it fail to compile.
export type VocabularyIsPartitioned = _AssertTrue<[_Unclassified] extends [never] ? true : false>

const PRESENCE_SET: ReadonlySet<FilterOperator> = new Set(PRESENCE_OPERATORS)
const LIST_SET: ReadonlySet<FilterOperator> = new Set(LIST_OPERATORS)
const SCALAR_SET: ReadonlySet<FilterOperator> = new Set(SCALAR_OPERATORS)

/** Whether `op` is a value-less presence operator (`null`/`notNull`). */
export function isPresenceOperator(op: FilterOperator): op is PresenceOperator {
  return PRESENCE_SET.has(op)
}

/** Whether `op` takes a set of values (`in`/`nin`). */
export function isListOperator(op: FilterOperator): op is ListOperator {
  return LIST_SET.has(op)
}

/** Whether `op` takes a single scalar value (`eq`, `neq`, `gt`, …). */
export function isScalarOperator(op: FilterOperator): op is ScalarOperator {
  return SCALAR_SET.has(op)
}
