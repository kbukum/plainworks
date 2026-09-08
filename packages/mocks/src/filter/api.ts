import {
  FILTER_OPERATOR_TOKENS_LONGEST_FIRST,
  filterOperatorFromToken,
} from "@plainworks/http/list"
import type { FilterCondition, FilterOperator, FilterQuery } from "./types"

/**
 * Wire tokens longest-first, so a multi-segment token (`not.in`, `not.is.null`) is matched before a
 * shorter prefix (`in`, `is.null`). Without this, `not.in.(a,b)` would split on the first `.` into an
 * unknown `not` and be dropped. Provided by `@plainworks/http` — the one canonical token contract —
 * so the mock parser can never drift from the request builder.
 */
const API_TOKENS = FILTER_OPERATOR_TOKENS_LONGEST_FIRST

/**
 * Parse PostgREST/Supabase-style API params back into a {@link FilterQuery}.
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
  const resolved = resolveToken(apiValue)
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
    return { field, operator, value: parseApiArray(rest.slice(1, -1)) }
  }

  // Scalar operators take the entire remainder literally: parentheses are data here, so a scalar
  // value of `(foo)` round-trips instead of being misread as the array form.
  return { field, operator, value: unescapeApiValue(rest) }
}

/** Split a wire value into its operator token and the remaining value, matching the longest known token. */
function resolveToken(apiValue: string): { token: string; rest: string } | null {
  for (const token of API_TOKENS) {
    if (apiValue === token) {
      return { token, rest: "" }
    }
    if (apiValue.startsWith(`${token}.`)) {
      return { token, rest: apiValue.slice(token.length + 1) }
    }
  }
  return null
}

/** Split a comma-separated list, honouring backslash escapes for literal commas and backslashes. */
function parseApiArray(inner: string): string[] {
  const values: string[] = []
  let current = ""
  let escaped = false

  for (const char of inner) {
    if (escaped) {
      current += char
      escaped = false
    } else if (char === "\\") {
      escaped = true
    } else if (char === ",") {
      values.push(current)
      current = ""
    } else {
      current += char
    }
  }

  if (current) {
    values.push(current)
  }

  return values
}

/**
 * Reverse the builder's backslash escaping: any `\x` collapses to `x`, so `\\` → `\` (a literal
 * backslash round-trips) and `\,`/`\(`/`\)` → their literal char. Mirrors `escapeScalarValue` in
 * `@plainworks/http`.
 */
function unescapeApiValue(value: string): string {
  return value.replace(/\\(.)/g, "$1")
}
