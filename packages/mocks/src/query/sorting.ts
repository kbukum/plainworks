/**
 * Sorting utilities for the mock handlers.
 */

export type SortDirection = "asc" | "desc"

export interface SortParams<K extends string = string> {
  field?: K
  order?: SortDirection
}

/** Return a new array sorted by `field`. Numbers compare numerically; everything else lexically. */
export function sortBy<T extends Record<string, unknown>>(
  items: T[],
  { field, order = "asc" }: SortParams<keyof T & string> = {},
): T[] {
  if (!field) return items

  return [...items].sort((a, b) => {
    const aVal = a[field]
    const bVal = b[field]

    if (aVal === bVal) return 0
    if (aVal === null || aVal === undefined) return 1
    if (bVal === null || bVal === undefined) return -1

    const comparison = compareValues(aVal, bVal)
    return order === "desc" ? -comparison : comparison
  })
}

/** Compare two unknown values: numbers numerically, otherwise by string coercion. */
function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") {
    return a < b ? -1 : a > b ? 1 : 0
  }
  const as = String(a)
  const bs = String(b)
  return as < bs ? -1 : as > bs ? 1 : 0
}
