/**
 * Whether `value` is a safe integer of at least `1` — the check for counts, capacities, byte caps,
 * and durations that must be set. Unsafe integers are rejected because arithmetic on them is no
 * longer exact.
 */
export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

/** Whether `value` is a safe integer of at least `0` — the check for depths, retries, and offsets. */
export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}
