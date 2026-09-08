/**
 * The canonical filter-operator ↔ wire-token contract for the PostgREST/Supabase-style list read —
 * the one source of truth both the request builder ({@link buildListQuery}) and a backend parser
 * (e.g. `@plainworks/mocks`) consume, so the two sides can never drift on how an operator serializes.
 */

/**
 * The PostgREST/Supabase-style filter operators — the canonical list-read vocabulary plainworks
 * defines for its backends. Typed on the client (this union); serialized to the `field=op.value`
 * string the server parses. `null`/`notNull` are value-less presence checks; `in`/`nin` take a
 * list; every other operator takes a single scalar.
 */
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

/** The `field=<token>` operator serialization: the PostgREST token the canonical contract specifies. */
export const FILTER_OPERATOR_TOKENS: Readonly<Record<FilterOperator, string>> = {
  eq: "eq",
  neq: "neq",
  gt: "gt",
  gte: "gte",
  lt: "lt",
  lte: "lte",
  like: "like",
  ilike: "ilike",
  in: "in",
  nin: "not.in",
  null: "is.null",
  notNull: "not.is.null",
}

/**
 * The wire tokens, longest first, so a multi-segment token (`not.in`, `not.is.null`) is matched
 * before a shorter prefix (`in`, `is.null`) when splitting a `field=op.value` parameter.
 */
export const FILTER_OPERATOR_TOKENS_LONGEST_FIRST: readonly string[] = Object.values(
  FILTER_OPERATOR_TOKENS,
).sort((a, b) => b.length - a.length)

/** Resolve a wire token back to its {@link FilterOperator}, or `null` when the token is unknown. */
export function filterOperatorFromToken(token: string): FilterOperator | null {
  for (const [operator, wireToken] of Object.entries(FILTER_OPERATOR_TOKENS)) {
    if (wireToken === token) {
      return operator as FilterOperator
    }
  }
  return null
}
