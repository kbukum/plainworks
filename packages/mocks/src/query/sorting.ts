/**
 * Sorting utilities for the mock handlers.
 */

export type SortDirection = "asc" | "desc"

/** A custom comparator for sorting values. Returns negative if a < b, positive if a > b, or 0. */
export type ValueComparator = (a: unknown, b: unknown) => number

export interface SortParams<K extends string = string> {
  field?: K | undefined
  order?: SortDirection | undefined
  comparator?: ValueComparator | undefined
}

/** Return a new array sorted by `field`. Numbers compare numerically; everything else lexically, unless a custom comparator is provided. */
export function sortBy<T extends Record<string, unknown>>(
  items: T[],
  { field, order = "asc", comparator }: SortParams<keyof T & string> = {},
): T[] {
  if (!field) return items

  return [...items].sort((a, b) => {
    const aVal = a[field]
    const bVal = b[field]

    if (aVal === bVal) return 0
    if (aVal === null || aVal === undefined) return 1
    if (bVal === null || bVal === undefined) return -1

    const comparison = comparator ? comparator(aVal, bVal) : compareValues(aVal, bVal)
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
