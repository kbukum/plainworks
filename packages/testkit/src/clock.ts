import { type Clock, parseTimestamp } from "@plainworks/std/time"

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

/**
 * Build a {@link ManualClock} starting at `start`: epoch milliseconds (default `0`) or an ISO-8601
 * timestamp with an explicit zone (see std's `parseTimestamp`). Time only changes when the
 * test calls {@link ManualClock.advance} or {@link ManualClock.set}, so nothing depends on real
 * elapsed time. Throws {@link RangeError} for a start that does not name one moment.
 */
export function manualClock(start: number | string = 0): ManualClock {
  let current = parseTimestamp(start)
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
