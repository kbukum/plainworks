// Server-safe public entry for `@plainworks/std` — the bottom of the layer graph. Re-export-only
// barrel (no logic here; implementation lives in concern modules). Zero runtime dependencies and no
// React or DOM imports, so it runs anywhere: Node, edge, RSC, browser.
export { base64urlDecode, base64urlEncode } from "./base64url"
export type { CookieAttributes, CookieSameSite } from "./cookie"
export {
  isCookieNameToken,
  isCookiePath,
  MAX_COOKIE_BYTES,
  serializeCookieAttributes,
  utf8ByteLength,
} from "./cookie"
export type { PlainErrorOptions } from "./errors"
export { ensureError, getErrorMessage, PlainError } from "./errors"
export { assert, assertNever, hasProperty, isDefined, isNonEmptyString, isRecord } from "./guard"
export type {
  CursorInfo,
  CursorResult,
  Facets,
  FilterOperator,
  FilterValue,
  ListFilter,
  ListMembershipFilter,
  ListQueryParams,
  PageInfo,
  PaginatedResult,
  PresenceFilter,
  ScalarFilter,
  SortDirection,
} from "./list"
export type { Handler, Interceptor } from "./pipeline"
export { composeInterceptors, pipeValues } from "./pipeline"
export type { RandomSource } from "./random"
export { createSeededRandom, idempotencyKey, randomId, systemRandom } from "./random"
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
  assertTimerMs,
  CircuitOpenError,
  classifyError,
  classifyStatus,
  combineSignals,
  createBoundedQueue,
  createCircuitBreaker,
  createDeadline,
  defaultBackoff,
  isRetryable,
  MAX_TIMER_MS,
  NetworkError,
  nextBackoff,
  QueueClosedError,
  QueueFullError,
  QueueWaitersFullError,
  RetryError,
  raceAbort,
  runWithRetry,
  StatusError,
  systemDelay,
  TimeoutError,
  withTimeout,
} from "./resilience"
export type { Err, Ok, Result } from "./result"
export { err, isErr, isOk, ok, unwrap, unwrapOr } from "./result"
export type { AuthContext, AuthHeaderProvider, AuthHeaders } from "./seam/auth"
export type { AuthorizationRequest, Authorizer, Decision } from "./seam/authorization"
export type { Listener, PlainEvent, Subscription } from "./seam/events"
export type { Identity } from "./seam/identity"
export type { RedirectSignal } from "./seam/redirect"
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
export type { StateCapabilities, StateSerializer, StateSource } from "./seam/state"
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
  WebTextEncoder,
  WebURL,
  WebURLSearchParams,
} from "./web"
