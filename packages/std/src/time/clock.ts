/**
 * A source of the current time in epoch milliseconds. Every API that reads "now" takes an optional
 * `clock?: Clock` that defaults to {@link systemClock}, so tests and demos can pin or drive time
 * without depending on the wall clock.
 */
export interface Clock {
  /** Current time in milliseconds since the Unix epoch. */
  now(): number
}

/** The default {@link Clock} backed by the host wall clock. Stateless and side-effect-free. */
export const systemClock: Clock = {
  now: () => Date.now(),
}

// An ISO-8601 timestamp with an explicit zone. A zone-less timestamp reads as local time, so the
// same text would name a different moment on each machine.
const ISO_ZONED_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/

/**
 * Whether `timestamp` has the zoned ISO-8601 shape and names a real calendar date and time. Some
 * engines' `Date.parse` rolls an impossible date such as February 30 over into March instead of
 * rejecting it.
 */
function isCalendarTimestamp(timestamp: string): boolean {
  const match = ISO_ZONED_TIMESTAMP.exec(timestamp)
  if (match === null) {
    return false
  }
  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number)
  if (year === undefined || month === undefined || day === undefined) {
    return false
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth &&
    (hour ?? 0) <= 23 &&
    (minute ?? 0) <= 59
  )
}

/**
 * Read a timestamp as epoch milliseconds. Accepts finite epoch milliseconds or an ISO-8601
 * timestamp with an explicit zone, such as `"2026-01-15T12:00:00.000Z"`.
 *
 * @throws {RangeError} When the input does not name exactly one moment (a zone-less or malformed
 *   timestamp, or a non-finite number).
 */
export function parseTimestamp(timestamp: number | string): number {
  const ms =
    typeof timestamp === "number"
      ? timestamp
      : isCalendarTimestamp(timestamp)
        ? Date.parse(timestamp)
        : Number.NaN
  if (!Number.isFinite(ms)) {
    throw new RangeError(
      `Expected epoch milliseconds or an ISO-8601 timestamp with a zone, received: ${timestamp}`,
    )
  }
  return ms
}

/**
 * A {@link Clock} pinned to one timestamp (see {@link parseTimestamp} for the accepted forms).
 * Use it where a running app needs a stable "now", such as a demo backend seeded for the browser
 * gate. Tests that must move time use `manualClock` from `@plainworks/testkit` instead.
 *
 * @throws {RangeError} When `timestamp` does not name exactly one moment.
 */
export function fixedClock(timestamp: number | string): Clock {
  const ms = parseTimestamp(timestamp)
  return { now: () => ms }
}
