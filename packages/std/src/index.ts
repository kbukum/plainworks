// Server-safe public entry for `@plainworks/std` — the bottom of the layer graph. Re-export-only
// barrel (no logic here; implementation lives in concern modules). Zero runtime dependencies and no
// React or DOM imports, so it runs anywhere: Node, edge, RSC, browser.
export { base64urlDecode, base64urlEncode } from "./base64url"
export type { CookieAttributes, CookieSameSite } from "./cookie"
export {
  isCookieNameToken,
  isCookiePath,
  MAX_COOKIE_BYTES,
  parseCookieHeader,
  serializeCookieAttributes,
  utf8ByteLength,
} from "./cookie"
export type { ErrorSnapshot, PlainErrorOptions } from "./errors"
export { createErrorSnapshot, ensureError, getErrorMessage, PlainError } from "./errors"
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
export type { RandomSource } from "./random"
export { createSeededRandom, idempotencyKey, randomId, systemRandom } from "./random"
export type { RedactOptions } from "./redact"
export { isSensitiveKey, redact } from "./redact"
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
export type { Err, Ok, Result } from "./result"
export { err, isErr, isOk, ok, unwrap, unwrapOr } from "./result"
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
  StateSerializer,
  StateSource,
  StreamFrame,
  StreamTransport,
  StreamTransportContext,
  StreamTransportFactory,
  Subscription,
} from "./seam"
export { guardSchema, unsafePassthrough, validateWithSchema } from "./seam"
export type { ReconcilerReport, StateReconciler } from "./state-reconciler"
export { createSourceReconciler } from "./state-reconciler"
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
