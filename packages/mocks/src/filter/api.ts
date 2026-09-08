import {
  filterOperatorFromToken,
  parseDelimitedList,
  splitOperatorToken,
  unescapeValue,
} from "@plainworks/http/list"
import type { FilterCondition, FilterOperator, FilterQuery } from "./types"

/**
 * Parse PostgREST/Supabase-style API params back into a {@link FilterQuery}.
 *
 * The REST wire dialect — the operator↔token grammar, the longest-first token match, and the value
 * escape/parse codec — is owned by `@plainworks/http/list` (the L1 REST dialect this L4 backend
 * binds downward to), so this fake backend and the `buildListQuery` request builder decode/encode
 * through one codec and can never drift. This module only composes those primitives into the mock's
 * {@link FilterQuery} domain shape.
 *
 * @example
 * ```ts
 * parseApiParams({ status: "eq.active", priority: "gt.3" })
 * // { conditions: [{ field: "status", operator: "eq", value: "active" }, ...] }
 * ```
 */
export function parseApiParams(params: Record<string, string>): FilterQuery {
  const conditions: FilterCondition[] = []
  for (const [field, value] of Object.entries(params)) {
    const condition = parseApiCondition(field, value)
    if (condition) {
      conditions.push(condition)
    }
  }
  return { conditions }
}

/** Parse a single `field=op.value` API condition, returning `null` when it is not recognised. */
function parseApiCondition(field: string, apiValue: string): FilterCondition | null {
  const resolved = splitOperatorToken(apiValue)
  if (resolved === null) {
    return null
  }
  const operator: FilterOperator | null = filterOperatorFromToken(resolved.token)
  if (operator === null) {
    return null
  }
  if (operator === "null" || operator === "notNull") {
    // Presence checks are value-less: the token must be the whole value. These params are
    // untrusted, so a suffixed token (`not.is.null.foo`) is unrecognised, never a silent filter.
    if (resolved.rest !== "") {
      return null
    }
    return { field, operator, value: null }
  }

  const { rest } = resolved
  if (operator === "in" || operator === "nin") {
    // Membership is always parenthesized on the wire (`in.(a,b,c)`); a bare remainder is malformed.
    if (!rest.startsWith("(") || !rest.endsWith(")")) {
      return null
    }
    return { field, operator, value: parseDelimitedList(rest.slice(1, -1)) }
  }

  // Scalar operators take the entire remainder literally: parentheses are data here, so a scalar
  // value of `(foo)` round-trips instead of being misread as the array form.
  return { field, operator, value: unescapeValue(rest) }
}
