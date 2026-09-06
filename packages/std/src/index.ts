// Server-safe public entry for `@plainworks/std` — the bottom of the layer graph. Re-export-only barrel (no logic here; implementation lives in concern modules). Zero runtime dependencies and no React or DOM imports, so it runs anywhere: Node, edge, RSC, browser.
export { assert, assertNever } from "./assert"
export type { PlainErrorOptions } from "./errors"
export { ensureError, getErrorMessage, PlainError } from "./errors"
export { hasProperty, isDefined, isNonEmptyString, isRecord } from "./guards"
export { idempotencyKey, randomId } from "./id"
export type { Handler, Interceptor } from "./pipeline"
export { composeInterceptors, pipeValues } from "./pipeline"
export type { RandomSource } from "./random"
export { createSeededRandom, systemRandom } from "./random"
export type { RedactOptions } from "./redact"
export { isSensitiveKey, redact } from "./redact"
export type {
  BackoffPolicy,
  BoundedQueue,
  CircuitBreaker,
  CircuitBreakerOptions,
  CircuitState,
  Classification,
  Deadline,
  Delay,
  FailureCategory,
  FailureDisposition,
  JitterStrategy,
  OverflowPolicy,
  RetryDeps,
  RetryPolicy,
} from "./resilience"
export {
  AbortError,
  CircuitOpenError,
  classifyError,
  classifyStatus,
  combineSignals,
  createBoundedQueue,
  createCircuitBreaker,
  createDeadline,
  defaultBackoff,
  isRetryable,
  NetworkError,
  nextBackoff,
  QueueClosedError,
  QueueFullError,
  QueueWaitersFullError,
  RetryError,
  runWithRetry,
  StatusError,
  systemDelay,
  TimeoutError,
  withTimeout,
} from "./resilience"
export type { Err, Ok, Result } from "./result"
export { err, isErr, isOk, ok, unwrap, unwrapOr } from "./result"
export type { AuthContext, AuthHeaderProvider, AuthHeaders } from "./seam/auth"
export type { Listener, PlainEvent, Subscription } from "./seam/events"
export type {
  InferSchemaOutput,
  StandardSchemaFailure,
  StandardSchemaIssue,
  StandardSchemaPathSegment,
  StandardSchemaProps,
  StandardSchemaResult,
  StandardSchemaSuccess,
  StandardSchemaTypes,
  StandardSchemaV1,
} from "./seam/schema"
export { unsafePassthrough, validateWithSchema } from "./seam/schema"
export type { Clock } from "./time"
export { systemClock } from "./time"
export type {
  WebAbortController,
  WebAbortSignal,
  WebBodyInit,
  WebFetch,
  WebHeaders,
  WebHeadersInit,
  WebReadableStream,
  WebReadableStreamDefaultReader,
  WebRequestInit,
  WebResponse,
  WebResponseInit,
  WebTextDecoder,
  WebURL,
  WebURLSearchParams,
} from "./web"
