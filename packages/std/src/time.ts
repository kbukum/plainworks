/**
 * A source of the current time in epoch milliseconds. Inject a `Clock` wherever code reads "now" so tests can drive time deterministically instead of depending on the wall clock.
 */
export interface Clock {
  /** Current time in milliseconds since the Unix epoch. */
  now(): number
}

/** The default {@link Clock} backed by the host wall clock. Stateless and side-effect-free. */
export const systemClock: Clock = {
  now: () => Date.now(),
}
