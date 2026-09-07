import { PlainError } from "../errors"
import type { RandomSource } from "../random"
import { systemRandom } from "../random"
import type { WebAbortSignal } from "../web"
import type { BackoffPolicy } from "./backoff"
import { assertBackoffPolicy, nextBackoff } from "./backoff"
import { isRetryable as defaultIsRetryable } from "./classify"
import type { Delay } from "./timeout"
import { AbortError, combineSignals, systemDelay } from "./timeout"

/**
 * Retry contract for a single operation. Retries fire **only** when `idempotent` is `true` — a non-idempotent write is never retried automatically, because a partial success could be duplicated. `isRetryable` and `retryAfter` default to the shared classifier and no hint respectively.
 */
export interface RetryPolicy {
  /** Total attempts including the first; must be `>= 1`. */
  readonly maxAttempts: number
  /** Backoff schedule between attempts. */
  readonly backoff: BackoffPolicy
  /** Retries fire only for an idempotent operation (safe to run more than once). */
  readonly idempotent: boolean
  /** Decide whether a failure is retryable. Defaults to the shared `isRetryable` classifier. Evaluated once per failure. */
  readonly isRetryable?: (error: unknown) => boolean
  /** Extract a server-supplied delay hint (ms) from a failure, e.g. `Retry-After`. An invalid (non-finite or negative) hint is ignored; a valid hint is clamped to `backoff.maxMs`. */
  readonly retryAfter?: (error: unknown) => number | undefined
}

/** Injected, deterministic-under-test dependencies for {@link runWithRetry}. */
export interface RetryDeps {
  /** Seedable jitter source; defaults to the system RNG. */
  readonly random?: RandomSource
  /** Injectable delay; defaults to the host timer. */
  readonly delay?: Delay
  /** Caller cancellation — aborts an in-flight backoff wait and stops further attempts. */
  readonly signal?: WebAbortSignal
}

/** Raised when every attempt failed. Preserves the final failure as `cause` and the attempt count. */
export class RetryError extends PlainError<"std/retry-exhausted"> {
  /** Number of attempts made before giving up. */
  readonly attempts: number

  constructor(attempts: number, options?: { cause?: unknown }) {
    super("std/retry-exhausted", `Retry exhausted after ${attempts} attempt(s)`, options)
    this.attempts = attempts
  }
}

/**
 * Drive `operation` under `policy`: attempt, and on a retryable failure of an idempotent operation wait a bounded, jittered backoff (honoring a `retryAfter` hint when present) before the next attempt, up to `maxAttempts`. A non-idempotent or non-retryable failure propagates immediately; a caller abort — before an attempt, while one is in flight, or during a backoff wait — propagates as a fatal {@link AbortError} and stops the loop (each attempt receives the caller signal so a cooperative operation can cancel its own work, and an uncooperative one is abandoned rather than awaited); exhausting all attempts throws a {@link RetryError} whose `cause` is the last failure. `random`/`delay` are injected for deterministic tests.
 *
 * @param operation - Receives the 0-based attempt index and a `WebAbortSignal` that mirrors the caller's cancellation; returns the operation's value.
 */
export async function runWithRetry<T>(
  operation: (attempt: number, signal: WebAbortSignal) => Promise<T>,
  policy: RetryPolicy,
  deps: RetryDeps = {},
): Promise<T> {
  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw new RangeError("RetryPolicy.maxAttempts must be an integer >= 1")
  }
  assertBackoffPolicy(policy.backoff)
  const random = deps.random ?? systemRandom
  const delay = deps.delay ?? systemDelay
  const isRetryable = policy.isRetryable ?? defaultIsRetryable
  let previousMs = policy.backoff.baseMs

  for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
    // Cancellation is checked before every attempt, so a pre-aborted signal (or an abort that lands between backoff and the next attempt) never starts more work.
    if (deps.signal?.aborted) {
      throw new AbortError({ cause: deps.signal.reason })
    }
    try {
      return await attemptOnce(operation, attempt, deps.signal)
    } catch (error) {
      // Classify once: a custom predicate may be stateful or costly, and the same verdict drives both the give-up decision and the RetryError wrap on the final attempt.
      const retryable = policy.idempotent && isRetryable(error)
      if (!retryable) {
        throw error
      }
      if (attempt === policy.maxAttempts - 1) {
        throw new RetryError(policy.maxAttempts, { cause: error })
      }
      const hint = policy.retryAfter?.(error)
      const waitMs =
        hint !== undefined && Number.isFinite(hint) && hint >= 0
          ? Math.min(hint, policy.backoff.maxMs)
          : nextBackoff(policy.backoff, attempt, random, previousMs)
      previousMs = waitMs
      await delay(waitMs, deps.signal)
    }
  }
  // Unreachable: the loop either returns a value or throws inside the catch.
  throw new RetryError(policy.maxAttempts)
}

/**
 * Run one attempt, handing it a signal that mirrors the caller's cancellation. If the caller aborts while the attempt is pending, reject immediately with a fatal {@link AbortError}; a later settle of the abandoned attempt is discarded, so a cancelled call never resolves with a stale success.
 */
function attemptOnce<T>(
  operation: (attempt: number, signal: WebAbortSignal) => Promise<T>,
  attempt: number,
  signal: WebAbortSignal | undefined,
): Promise<T> {
  const operationSignal = combineSignals(signal)
  if (signal === undefined) {
    return operation(attempt, operationSignal)
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const finish = (run: () => void): void => {
      if (settled) {
        return
      }
      settled = true
      signal.removeEventListener("abort", onAbort)
      run()
    }
    const onAbort = (): void => finish(() => reject(new AbortError({ cause: signal.reason })))
    signal.addEventListener("abort", onAbort, { once: true })
    try {
      operation(attempt, operationSignal).then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => finish(() => reject(error)),
      )
    } catch (error) {
      // A synchronous throw settles through the same cleanup, so the abort listener is never left attached to a long-lived caller signal.
      finish(() => reject(error))
    }
  })
}
