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

/**
 * Build a {@link ManualClock} starting at `startMs` (default `0`). Time only changes when the test
 * calls {@link ManualClock.advance} or {@link ManualClock.set}, so nothing depends on real elapsed
 * time.
 */
export function manualClock(startMs = 0): ManualClock {
  let current = startMs
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
