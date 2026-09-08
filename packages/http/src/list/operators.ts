/**
 * The PostgREST/Supabase REST **wire dialect** for the list contract: how each abstract
 * {@link FilterOperator} (the vocabulary owned by `@plainworks/std`) serializes to and parses from
 * a `field=op.value` URL token. This is the one place the REST token grammar lives, so the request
 * builder (`buildListQuery`) and a REST backend parser (e.g. `@plainworks/mocks`) bind to the same
 * table and can never drift. Not a `std` concern — `std` owns the abstract shapes, `http` owns the
 * URL.
 */

import type { FilterOperator } from "@plainworks/std"

/** The `field=<token>` operator serialization: the PostgREST token this REST dialect emits per operator. */
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

/**
 * Split an untrusted `op.value` wire string into its operator token and the remaining value,
 * matching the longest known token first (so `not.in.(a,b)` resolves to `not.in`, not the unknown
 * `not`). Returns `null` when no known token prefixes the string — a REST backend treats that as an
 * unrecognised parameter, never a silent filter.
 */
export function splitOperatorToken(rawValue: string): { token: string; rest: string } | null {
  for (const token of FILTER_OPERATOR_TOKENS_LONGEST_FIRST) {
    if (rawValue === token) {
      return { token, rest: "" }
    }
    if (rawValue.startsWith(`${token}.`)) {
      return { token, rest: rawValue.slice(token.length + 1) }
    }
  }
  return null
}
