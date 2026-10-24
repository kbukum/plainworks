import { isRecord } from "./predicate"

/**
 * Whether two values have the same structure: primitives by `Object.is`, arrays item by item, and
 * records by the same set of fields with equal values. An array never equals a record. Meant for
 * plain data such as cache keys and decoded payloads; it does not compare `Map`, `Set` or `Date`
 * contents.
 */
export function isStructurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((item, i) => isStructurallyEqual(item, right[i]))
    )
  }
  if (isRecord(left) && isRecord(right)) {
    const fields = Object.keys(left)
    return (
      fields.length === Object.keys(right).length &&
      fields.every(
        (field) => Object.hasOwn(right, field) && isStructurallyEqual(left[field], right[field]),
      )
    )
  }
  return false
}
