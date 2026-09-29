// Server-safe public entry for `@plainworks/http`: the one host-independent typed fetch client the
// request/response protocols build on, with its errors, codecs, methods and URLs. Interceptors live
// on `./interceptor` and the REST list dialect on `./list`. Re-export-only barrel. No React or DOM
// imports, so the `.` entry runs anywhere (Node, edge, RSC).
export type { BodyCodec, EncodedBody, JsonCodecOptions } from "./codec"
export { createJsonCodec, DEFAULT_MAX_BODY_BYTES, jsonCodec } from "./codec"
export type { HttpErrorKind } from "./error"
export { HttpError, isHttpError } from "./error"
export type {
  HttpClient,
  HttpClientOptions,
  HttpRequest,
  HttpResponse,
  RequestInput,
  ResourceMethods,
  ResourceReadOptions,
  ResourceWriteOptions,
} from "./exchange"
export { createHttpClient } from "./exchange"
export type { HttpMethod } from "./method"
export { isIdempotentMethod } from "./method"
export type { BuildUrlInput, QueryParams, QueryValue } from "./url"
export { buildUrl } from "./url"
