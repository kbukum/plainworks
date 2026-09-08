/** Narrow away `null` and `undefined`, keeping every other value (including `0`, `""`, `false`). */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

/** Narrow to a non-null, non-array object safe to index by string key. Structural only: it accepts any such object, including class instances, `Date`, and `Map` — it does not assert a plain `Object.prototype`. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Narrow to a string with at least one character. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

/** Narrow to a record that owns `key` as an own (not inherited) property, so it can be read without an unchecked cast. */
export function hasProperty<K extends PropertyKey>(
  value: unknown,
  key: K,
): value is Record<K, unknown> {
  return isRecord(value) && Object.hasOwn(value, key)
}
