import { apiOperatorToFilter } from "./operators"
import type { FilterCondition, FilterQuery } from "./types"

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
  if (apiValue === "is.null") {
    return { field, operator: "null", value: null }
  }
  if (apiValue === "not.is.null") {
    return { field, operator: "notNull", value: null }
  }

  const match = apiValue.match(/^(\w+)\.(.+)$/)
  if (!match) {
    return null
  }

  const apiOp = match[1]
  const rawValue = match[2]
  if (apiOp === undefined || rawValue === undefined) {
    return null
  }

  const operator = apiOperatorToFilter(apiOp)
  if (!operator) {
    return null
  }

  // Array form: in.(a,b,c)
  if (rawValue.startsWith("(") && rawValue.endsWith(")")) {
    return { field, operator, value: parseApiArray(rawValue.slice(1, -1)) }
  }

  return { field, operator, value: unescapeApiValue(rawValue) }
}

/** Split a comma-separated list, honouring backslash escapes for literal commas. */
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

/** Reverse the PostgREST escaping of parentheses and commas. */
function unescapeApiValue(value: string): string {
  return value.replace(/\\([(),])/g, "$1")
}
