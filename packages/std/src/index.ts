// Server-safe public entry for `@plainworks/std` — the bottom of the layer graph. Re-export-only
// barrel (no logic here; implementation lives in concern modules). Zero runtime dependencies and no
// React or DOM imports, so it runs anywhere: Node, edge, RSC, browser.
export { base64urlDecode, base64urlEncode } from "./encoding"
export type { Err, ErrorSnapshot, Ok, PlainErrorOptions, Result } from "./error"
export {
  createErrorSnapshot,
  ensureError,
  err,
  getErrorMessage,
  isErr,
  isOk,
  ok,
  PlainError,
  unwrap,
  unwrapOr,
} from "./error"
export {
  assert,
  assertNever,
  hasProperty,
  isAbsentOr,
  isDefined,
  isNonEmptyString,
  isOneOf,
  isRecord,
} from "./guard"
export type {
  CursorInfo,
  CursorResult,
  Facets,
  FilterOperator,
  FilterValue,
  ListFilter,
  ListMembershipFilter,
  ListOperator,
  ListQueryParams,
  PageInfo,
  PaginatedResult,
  PresenceFilter,
  PresenceOperator,
  ScalarFilter,
  ScalarOperator,
  SortDirection,
} from "./list"
export {
  isCursorInfo,
  isCursorResult,
  isFacets,
  isListOperator,
  isPageInfo,
  isPaginatedResult,
  isPresenceOperator,
  isScalarOperator,
  LIST_OPERATORS,
  PRESENCE_OPERATORS,
  SCALAR_OPERATORS,
} from "./list"
export type { Handler, Interceptor } from "./pipeline"
export { composeInterceptors, pipeValues } from "./pipeline"
export type { RedactOptions } from "./privacy"
export { isSensitiveKey, redact } from "./privacy"
export type { RandomSource } from "./random"
export { createSeededRandom, idempotencyKey, randomId, systemRandom } from "./random"
export type {
  BackoffPolicy,
  BoundedQueue,
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
  classifyError,
  classifyStatus,
  combineSignals,
  createBoundedQueue,
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
export type {
  AuthContext,
  AuthHeaderProvider,
  AuthHeaders,
  AuthorizationRequest,
  Authorizer,
  Decision,
  EventSink,
  Identity,
  InferSchemaOutput,
  Listener,
  PlainEvent,
  ReconcilerReport,
  RedirectSignal,
  StandardSchemaFailure,
  StandardSchemaIssue,
  StandardSchemaPathSegment,
  StandardSchemaProps,
  StandardSchemaResult,
  StandardSchemaSuccess,
  StandardSchemaTypes,
  StandardSchemaV1,
  StateCapabilities,
  StateReconciler,
  StateSerializer,
  StateSource,
  StreamFrame,
  StreamTransport,
  StreamTransportContext,
  StreamTransportFactory,
  Subscription,
} from "./seam"
export { createSourceReconciler, guardSchema, unsafePassthrough, validateWithSchema } from "./seam"
export type { Clock } from "./time"
export { systemClock } from "./time"
export type {
  CookieAttributes,
  CookieSameSite,
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
export {
  isCookieNameToken,
  isCookiePath,
  MAX_COOKIE_BYTES,
  parseCookieHeader,
  serializeCookieAttributes,
  utf8ByteLength,
} from "./web"
