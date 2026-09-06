// Server-safe public entry for `@plainworks/http` — the one host-independent typed fetch client the
// request/response protocols build on. Re-export-only barrel (no logic here; implementation lives in
// concern-named modules). No React or DOM imports, so the `.` entry runs anywhere (Node, edge, RSC).
export type { BodyCodec, EncodedBody, JsonCodecOptions } from "./codec"
export { createJsonCodec, DEFAULT_MAX_BODY_BYTES, jsonCodec } from "./codec"
export type { HttpErrorKind } from "./error"
export { HttpError, isHttpError } from "./error"
export type {
  FetchLike,
  HttpClient,
  HttpClientOptions,
  HttpRequest,
  HttpResponse,
  RequestInput,
} from "./exchange"
export { createHttpClient } from "./exchange"
export type {
  HttpHandler,
  HttpInterceptor,
  LoggedRequest,
  LoggedResponse,
  ObservabilityHooks,
} from "./interceptor"
export { authHeaderInterceptor, loggingInterceptor } from "./interceptor"
export type { HttpMethod } from "./method"
export { isIdempotentMethod } from "./method"
export type { BuildUrlInput, QueryParams, QueryValue } from "./url"
export { buildUrl } from "./url"
