import { isRetryable, type RetryPolicy } from "@plainworks/std"
import { HttpError } from "../error"
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
 * A `Retry-After` hint is clamped to `backoff.maxMs` by the shared retry driver, so size `maxMs` at
 * or above the largest server delay you want to honor — otherwise a long `Retry-After` is shortened
 * to `maxMs` and the client may retry before the server's window elapses.
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

/**
 * Parse an HTTP `Retry-After` header into milliseconds: a bare integer is seconds; an HTTP date is
 * the delay until that instant (clamped at `0`). An absent or unparseable value yields `undefined`,
 * so the retry driver falls back to its normal backoff. `nowMs` is injected for deterministic tests.
 */
export function parseRetryAfterMs(headerValue: string | null, nowMs: number): number | undefined {
  if (headerValue === null) {
    return undefined
  }
  const trimmed = headerValue.trim()
  if (trimmed.length === 0) {
    return undefined
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000
  }
  const dateMs = Date.parse(trimmed)
  if (Number.isNaN(dateMs)) {
    return undefined
  }
  const deltaMs = dateMs - nowMs
  return deltaMs > 0 ? deltaMs : 0
}
