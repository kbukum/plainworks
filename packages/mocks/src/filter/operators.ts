import type { FilterOperator } from "./types"

/**
 * Map from each {@link FilterOperator} to its PostgREST/Supabase API token. Most operators map to
 * themselves; the null checks carry distinct wire tokens.
 */
export const OPERATOR_API: Record<FilterOperator, string> = {
  eq: "eq",
  neq: "neq",
  gt: "gt",
  gte: "gte",
  lt: "lt",
  lte: "lte",
  in: "in",
  nin: "nin",
  like: "like",
  ilike: "ilike",
  null: "is.null",
  notNull: "not.is.null",
}

/** Resolve a wire API token back to its {@link FilterOperator}, or `null` when unknown. */
export function apiOperatorToFilter(apiOp: string): FilterOperator | null {
  for (const [operator, api] of Object.entries(OPERATOR_API)) {
    if (api === apiOp) {
      return operator as FilterOperator
    }
  }
  return null
}
