import type { RandomSource } from "../random"
import { type BackoffPolicy, nextBackoff } from "./backoff"

/** Server delays are minimums, even when they exceed the local backoff ceiling. */
export function retryDelay(
  policy: BackoffPolicy,
  attempt: number,
  random: RandomSource,
  previousMs?: number,
  minimumMs?: number,
): number {
  const backoff = nextBackoff(policy, attempt, random, previousMs)
  return minimumMs !== undefined && Number.isFinite(minimumMs) && minimumMs >= 0
    ? Math.max(minimumMs, backoff)
    : backoff
}
