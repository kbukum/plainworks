import type { RandomSource } from "../random"
import { systemRandom } from "../random"

/**
 * How much randomness to fold into each backoff delay. `none` is bare exponential; `full` spreads a
 * delay uniformly across `[0, cap]` (best thundering-herd avoidance); `decorrelated` walks the
 * delay up from the previous value (AWS-style), keeping delays lively without a hard reset each
 * attempt.
 */
export type JitterStrategy = "none" | "full" | "decorrelated"

/**
 * A bounded exponential-backoff schedule. `baseMs` is the first delay, growing by `factor` each
 * retry and clamped to `maxMs`; `jitter` decorrelates concurrent retriers so they do not
 * resynchronize.
 */
export interface BackoffPolicy {
  /** Delay for the first retry, in milliseconds. */
  readonly baseMs: number
  /** Upper bound on any single delay, in milliseconds. */
  readonly maxMs: number
  /** Exponential growth factor per retry (typically `2`). */
  readonly factor: number
  /** Randomization strategy applied to the raw exponential delay. */
  readonly jitter: JitterStrategy
}

/** A conservative default schedule: 100ms base, ×2, capped at 10s, full jitter. */
export const defaultBackoff: BackoffPolicy = {
  baseMs: 100,
  maxMs: 10_000,
  factor: 2,
  jitter: "full",
}

/**
 * Validate a {@link BackoffPolicy}: finite `baseMs >= 0`, `maxMs >= baseMs`, `factor >= 1`, and a
 * supported `jitter`. A `NaN`/`Infinity` or malformed runtime discriminant would otherwise slip
 * past comparison-only guards and leak a non-finite delay (or `undefined`) out of
 * {@link nextBackoff}.
 */
export function assertBackoffPolicy(policy: BackoffPolicy): void {
  if (
    !Number.isFinite(policy.baseMs) ||
    !Number.isFinite(policy.maxMs) ||
    !Number.isFinite(policy.factor) ||
    policy.baseMs < 0 ||
    policy.maxMs < policy.baseMs ||
    policy.factor < 1 ||
    (policy.jitter !== "none" && policy.jitter !== "full" && policy.jitter !== "decorrelated")
  ) {
    throw new RangeError(
      'BackoffPolicy requires finite baseMs >= 0, maxMs >= baseMs, factor >= 1, and jitter of "none" | "full" | "decorrelated"',
    )
  }
}

/**
 * Compute the delay (ms) before retry number `attempt` (0-based: `0` is the first retry). `random`
 * (seedable) drives jitter; `previousMs` feeds the `decorrelated` strategy and defaults to
 * `baseMs`. The result is always finite, non-negative, and `<= maxMs`.
 */
export function nextBackoff(
  policy: BackoffPolicy,
  attempt: number,
  random: RandomSource = systemRandom,
  previousMs?: number,
): number {
  assertBackoffPolicy(policy)
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new RangeError("nextBackoff requires a non-negative integer attempt")
  }
  if (previousMs !== undefined && !Number.isFinite(previousMs)) {
    throw new RangeError("nextBackoff requires a finite previousMs when supplied")
  }
  // `baseMs === 0` short-circuits before exponentiation: `0 * factor ** attempt` is
  // `0 * Infinity → NaN` once the power overflows, which would defeat the finite-result guarantee.
  const exponential =
    policy.baseMs === 0 ? 0 : Math.min(policy.maxMs, policy.baseMs * policy.factor ** attempt)
  switch (policy.jitter) {
    case "none":
      return exponential
    case "full":
      return random.next() * exponential
    case "decorrelated": {
      const previous = Math.max(previousMs ?? policy.baseMs, policy.baseMs)
      // A finite `previous * 3` can still overflow to `Infinity`; fall back to the cap so the
      // interpolation below never multiplies a zero random by `Infinity` into `NaN`.
      const rawUpper = previous * 3
      const upper = Number.isFinite(rawUpper) ? rawUpper : policy.maxMs
      return Math.min(policy.maxMs, policy.baseMs + random.next() * (upper - policy.baseMs))
    }
  }
}
