/**
 * Filtering utilities for the mock handlers.
 *
 * Supports filtering data by:
 * - PostgREST/Supabase style params (`status=eq.active`)
 * - simple `field=value` params
 * - free-text search across fields
 */

import type { FilterCondition } from "../filter"
import { parseApiParams } from "../filter"

/** Parse a query string into a flat params object. */
function parseQueryString(queryString: string): Record<string, string> {
  const params: Record<string, string> = {}
  const searchParams = new URLSearchParams(queryString)
  for (const [key, value] of searchParams.entries()) {
    params[key] = value
  }
  return params
}

/**
 * Filter data using PostgREST/Supabase style query params.
 *
 * @example
 * filterByApiParams(users, "status=eq.active&priority=gt.3")
 */
export function filterByApiParams<T extends Record<string, unknown>>(
  items: T[],
  queryString: string | undefined | null,
): T[] {
  if (!queryString) return items

  const query = parseApiParams(parseQueryString(queryString))
  if (query.conditions.length === 0) return items

  return filterByConditions(items, query.conditions)
}

/** Filter data using decoded filter conditions (all must match). */
export function filterByConditions<T extends Record<string, unknown>>(
  items: T[],
  conditions: FilterCondition[],
): T[] {
  if (conditions.length === 0) return items
  return items.filter((item) => conditions.every((condition) => matchesCondition(item, condition)))
}

type Normalized = string | number | boolean | null

/** Check whether a single item matches one filter condition. */
function matchesCondition<T extends Record<string, unknown>>(
  item: T,
  condition: FilterCondition,
): boolean {
  const { field, operator, value } = condition
  const itemValue = item[field]

  if (operator === "null") {
    return itemValue === null || itemValue === undefined
  }
  if (operator === "notNull") {
    return itemValue !== null && itemValue !== undefined
  }

  if (value === null || value === undefined) return true

  const normalizedItem = normalizeValue(itemValue)
  const normalizedValue = Array.isArray(value)
    ? value.map((v) => normalizeValue(v))
    : normalizeValue(value)

  switch (operator) {
    case "eq":
      return normalizedItem === normalizedValue
    case "neq":
      return normalizedItem !== normalizedValue
    case "gt":
      return compareNormalized(normalizedItem, normalizedValue) > 0
    case "gte":
      return compareNormalized(normalizedItem, normalizedValue) >= 0
    case "lt":
      return compareNormalized(normalizedItem, normalizedValue) < 0
    case "lte":
      return compareNormalized(normalizedItem, normalizedValue) <= 0
    case "in":
      return Array.isArray(normalizedValue) && normalizedValue.includes(normalizedItem)
    case "nin":
      return Array.isArray(normalizedValue) && !normalizedValue.includes(normalizedItem)
    case "like":
    case "ilike": {
      if (typeof itemValue !== "string" || typeof value !== "string") return false
      // SQL/PostgREST semantics: the pattern must match the whole value; substring matching needs
      // explicit `%` wildcards. Escape regex metacharacters first so input is literal text, then
      // translate only `%` and `_`.
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const pattern = `^${escaped.replace(/%/g, ".*").replace(/_/g, ".")}$`
      const flags = operator === "ilike" ? "i" : ""
      return new RegExp(pattern, flags).test(itemValue)
    }
    default:
      return true
  }
}

/** Compare two normalized values numerically when both are numbers, else lexically. */
function compareNormalized(a: Normalized | Normalized[], b: Normalized | Normalized[]): number {
  if (typeof a === "number" && typeof b === "number") {
    return a < b ? -1 : a > b ? 1 : 0
  }
  const as = String(a)
  const bs = String(b)
  return as < bs ? -1 : as > bs ? 1 : 0
}

/** Normalize a value for comparison: numbers stay numeric, strings lowercased (numeric when parseable). */
function normalizeValue(value: unknown): Normalized {
  if (value === null || value === undefined) return null
  if (typeof value === "number") return value
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    // Query params arrive as strings; coerce so `verified=eq.true` matches a boolean field.
    if (value === "true") return true
    if (value === "false") return false
    const num = Number(value)
    if (!Number.isNaN(num) && value.trim() !== "") return num
    return value.toLowerCase()
  }
  return String(value).toLowerCase()
}

/** Filter items to those where any of `fields` contains `search` (case-insensitive). */
export function filterBySearch<T extends Record<string, unknown>>(
  items: T[],
  search: string | undefined,
  fields: (keyof T)[],
): T[] {
  if (!search) return items

  const searchLower = search.toLowerCase()
  return items.filter((item) =>
    fields.some((field) => {
      const value = item[field]
      return typeof value === "string" && value.toLowerCase().includes(searchLower)
    }),
  )
}

/** Filter items by an exact field value, supporting comma-separated OR values. */
export function filterByField<T extends Record<string, unknown>>(
  items: T[],
  field: keyof T,
  value: unknown,
): T[] {
  if (value === undefined || value === null || value === "") return items

  // Query params arrive as strings; normalize both sides so `"true"` matches `true`, `"30"` matches
  // `30`, and string comparisons stay case-insensitive.
  if (typeof value === "string" && value.includes(",")) {
    const values = value.split(",").map((v) => normalizeValue(v.trim()))
    return items.filter((item) => values.includes(normalizeValue(item[field])))
  }

  const normalized = normalizeValue(value)
  return items.filter((item) => normalizeValue(item[field]) === normalized)
}

/** Apply several exact field filters in sequence. */
export function filterByFields<T extends Record<string, unknown>>(
  items: T[],
  filters: Partial<Record<keyof T, unknown>>,
): T[] {
  return Object.entries(filters).reduce<T[]>((acc, [field, value]) => {
    return filterByField(acc, field as keyof T, value)
  }, items)
}

/**
 * Count occurrences of each value for the given fields.
 *
 * @example
 * computeFacets(users, ["status", "role"])
 * // { status: { active: 10, pending: 5 }, role: { admin: 3, editor: 7 } }
 */
export function computeFacets<T extends Record<string, unknown>>(
  items: T[],
  fields: (keyof T)[],
): Record<string, Record<string, number>> {
  const facets: Record<string, Record<string, number>> = {}

  for (const field of fields) {
    const bucket: Record<string, number> = {}
    for (const item of items) {
      const value = item[field]
      if (value !== undefined && value !== null) {
        const key = String(value)
        bucket[key] = (bucket[key] ?? 0) + 1
      }
    }
    facets[String(field)] = bucket
  }

  return facets
}

/**
 * Count facet values with cross-filtering: for each facet field, apply every condition EXCEPT that
 * field's own, so a tab can show "what count would I get if I selected this option". A `_total`
 * entry per field carries the count with the other filters applied (for the "All" tab).
 */
export function computeFacetsWithFilters<T extends Record<string, unknown>>(
  items: T[],
  facetFields: (keyof T)[],
  conditions: FilterCondition[],
): Record<string, Record<string, number>> {
  const facets: Record<string, Record<string, number>> = {}

  for (const field of facetFields) {
    const fieldKey = String(field)
    const otherConditions = conditions.filter((c) => c.field !== fieldKey)
    const filteredItems = filterByConditions(items, otherConditions)

    const bucket: Record<string, number> = {}
    for (const item of filteredItems) {
      const value = item[field]
      if (value !== undefined && value !== null) {
        const key = String(value)
        bucket[key] = (bucket[key] ?? 0) + 1
      }
    }
    bucket._total = filteredItems.length
    facets[fieldKey] = bucket
  }

  return facets
}
