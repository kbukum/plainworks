import type { Clock } from "@plainworks/std"

/**
 * A {@link Clock} whose time is driven by the test, not the wall clock. Inject it wherever code
 * reads "now" through a `Clock` seam so time-dependent behaviour (backoff, timeouts, staleness) is
 * deterministic and instantaneous.
 */
export interface ManualClock extends Clock {
  /** Move time forward by `ms` milliseconds. Throws {@link RangeError} for a negative duration. */
  advance(ms: number): void
  /** Set the absolute current time to `ms` milliseconds since the Unix epoch. */
  set(ms: number): void
}

// An ISO-8601 instant with an explicit zone. A zone-less timestamp reads as local time, so the same
// text would name a different instant on each machine.
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/

function startTime(start: number | string): number {
  const ms = typeof start === "number" ? start : ISO_INSTANT.test(start) ? Date.parse(start) : NaN
  if (!Number.isFinite(ms)) {
    throw new RangeError(
      `manualClock requires epoch milliseconds or an ISO-8601 instant with a zone, received: ${start}`,
    )
  }
  return ms
}

/**
 * Build a {@link ManualClock} starting at `start`: epoch milliseconds (default `0`) or an ISO-8601
 * instant with an explicit zone, such as `"2026-01-15T12:00:00.000Z"`. Time only changes when the
 * test calls {@link ManualClock.advance} or {@link ManualClock.set}, so nothing depends on real
 * elapsed time. Throws {@link RangeError} for a start that does not name one instant.
 */
export function manualClock(start: number | string = 0): ManualClock {
  let current = startTime(start)
  return {
    now: () => current,
    advance: (ms: number) => {
      if (ms < 0) {
        throw new RangeError("manualClock.advance requires a non-negative duration")
      }
      current += ms
    },
    set: (ms: number) => {
      current = ms
    },
  }
}
