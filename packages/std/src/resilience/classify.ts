import { PlainError } from "../errors"

/**
 * Shared failure taxonomy: map any failure (an HTTP status or a thrown value) to a category and a
 * retry disposition, so the retry driver, the circuit breaker, and every transport decide
 * retryability from **one** classifier instead of re-implementing the rules per protocol.
 */

/**
 * A network-level failure (DNS, connection reset, offline) reported by a transport, wrapping the
 * host error as `cause`. Retryable under the classifier — unlike a raw `TypeError`, which is a
 * programmer fault and stays fatal.
 */
export class NetworkError extends PlainError<"std/network"> {
  constructor(message = "Network request failed", options?: { cause?: unknown }) {
    super("std/network", message, options)
  }
}

/** An HTTP-style status failure: carries the response status so the shared classifier can decide retryability from it via {@link classifyStatus}. */
export class StatusError extends PlainError<"std/status"> {
  /** The HTTP status code that failed the request. */
  readonly status: number

  constructor(status: number, options?: { cause?: unknown }) {
    super("std/status", `Request failed with status ${status}`, options)
    this.status = status
  }
}

/** Coarse failure family, useful for logging/metrics and for deciding how to degrade. */
export type FailureCategory = "network" | "timeout" | "transport" | "protocol" | "auth"

/** Whether the shared policy considers a failure worth retrying (idempotent operations only). */
export type FailureDisposition = "retryable" | "fatal"

/** A classified failure: its {@link FailureCategory} and {@link FailureDisposition}. */
export interface Classification {
  readonly category: FailureCategory
  readonly disposition: FailureDisposition
}

/**
 * Classify an HTTP status code (only meaningful for `>= 400`). `401`/`403` are auth and fatal (a
 * retry with the same credential fails identically); `408`/`429` and all `5xx` are retryable
 * (timeout / rate-limit / server); every other `4xx` — and any non-integer or out-of-range value —
 * is a fatal protocol error.
 */
export function classifyStatus(status: number): Classification {
  // A non-integer status is not a real HTTP code (e.g. `500.5`); treat it as a protocol fault
  // rather than let the `5xx` range retry malformed input.
  if (!Number.isInteger(status)) {
    return { category: "protocol", disposition: "fatal" }
  }
  if (status === 401 || status === 403) {
    return { category: "auth", disposition: "fatal" }
  }
  if (status === 408) {
    return { category: "timeout", disposition: "retryable" }
  }
  if (status === 429 || (status >= 500 && status < 600)) {
    return { category: "transport", disposition: "retryable" }
  }
  // Any other 4xx is a caller/protocol fault; a status below 400 is not a failure at all.
  return { category: "protocol", disposition: "fatal" }
}

/** Read the `name` of an unknown thrown value without assuming it is an `Error`. */
function errorName(error: unknown): string | undefined {
  return error instanceof Error ? error.name : undefined
}

/**
 * Classify a thrown value. A per-attempt timeout is retryable; a caller/deadline abort is fatal
 * (the overall budget is spent — do not retry); a retry-exhausted wrapper (`std/retry-exhausted`)
 * is classified from its preserved cause, so a repeatedly-failing idempotent call still counts
 * toward a breaker; a {@link StatusError} defers to {@link classifyStatus}; a {@link NetworkError}
 * — the type a transport wraps a failed `fetch` in — is a retryable network fault. Anything
 * unrecognized (including a raw `TypeError`, a programmer fault) is treated as fatal, the safe
 * default (never retry the unknown).
 */
export function classifyError(error: unknown): Classification {
  const name = errorName(error)
  if (name === "TimeoutError") {
    return { category: "timeout", disposition: "retryable" }
  }
  if (name === "AbortError") {
    return { category: "timeout", disposition: "fatal" }
  }
  // A retry-exhausted wrapper is only as fatal as the failure it preserved: classify its cause so a
  // `circuitBreaker(runWithRetry(...))` composition still counts repeated network outages toward
  // tripping.
  if (error instanceof PlainError && error.kind === "std/retry-exhausted") {
    return classifyError(error.cause)
  }
  if (error instanceof StatusError) {
    return classifyStatus(error.status)
  }
  if (error instanceof NetworkError) {
    return { category: "network", disposition: "retryable" }
  }
  return { category: "transport", disposition: "fatal" }
}

/** Convenience predicate: is this thrown value retryable under the shared classifier? */
export function isRetryable(error: unknown): boolean {
  return classifyError(error).disposition === "retryable"
}
