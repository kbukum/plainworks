/**
 * Resilience primitives for any transport or call path: failure classification, bounded exponential backoff, timeout/deadline composition, retry driving, a circuit breaker, and a bounded backpressure queue. Written once here at L0 so no caller forks its own copy. Re-export-only barrel; implementation lives in the concern-named modules beside it.
 */

export type { BackoffPolicy, JitterStrategy } from "./backoff"
export { defaultBackoff, nextBackoff } from "./backoff"
export type { BoundedQueue, OverflowPolicy } from "./bounded-queue"
export {
  createBoundedQueue,
  QueueClosedError,
  QueueFullError,
  QueueWaitersFullError,
} from "./bounded-queue"
export type { CircuitBreaker, CircuitBreakerOptions, CircuitState } from "./circuit-breaker"
export { CircuitOpenError, createCircuitBreaker } from "./circuit-breaker"
export type { Classification, FailureCategory, FailureDisposition } from "./classify"
export { classifyError, classifyStatus, isRetryable, NetworkError, StatusError } from "./classify"
export type { RetryDeps, RetryPolicy } from "./retry"
export { RetryError, runWithRetry } from "./retry"
export type { Deadline, Delay } from "./timeout"
export {
  AbortError,
  assertTimerMs,
  combineSignals,
  createDeadline,
  MAX_TIMER_MS,
  systemDelay,
  TimeoutError,
  withTimeout,
} from "./timeout"
