import { isRetryable, type RetryPolicy } from "@plainworks/std/resilience"
import { HttpError } from "../errors/http-error"
import { type HttpMethod, isIdempotentMethod } from "../method"

/** Retry verdict from an error alone: an {@link HttpError} carries its own, else the shared classifier decides. */
export function isHttpRetryable(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.retryable
  }
  return isRetryable(error)
}

/** Extract a `Retry-After` hint (ms) from a failure, when the response carried one. */
export function retryAfterOf(error: unknown): number | undefined {
  return error instanceof HttpError ? error.retryAfterMs : undefined
}

/**
 * Adapt a caller's base {@link RetryPolicy} to a concrete request: idempotency is method-derived
 * (overridable per request), and the http-aware classifier and `Retry-After` reader are wired in
 * unless the caller supplied their own. Returns `undefined` when no retry policy is configured, so
 * the client makes a single attempt.
 *
 * A server minimum is never shortened; a delay exceeding the total budget stops retries.
 */
export function resolveRetryPolicy(
  base: RetryPolicy | undefined,
  method: HttpMethod,
  idempotentOverride: boolean | undefined,
): RetryPolicy | undefined {
  if (base === undefined) {
    return undefined
  }
  return {
    ...base,
    idempotent: idempotentOverride ?? isIdempotentMethod(method),
    isRetryable: base.isRetryable ?? isHttpRetryable,
    retryAfter: base.retryAfter ?? retryAfterOf,
  }
}
