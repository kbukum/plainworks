// Re-export-only barrel for the web concern: structural types for the universal WHATWG surface, the
// `fetch` lookup, bounded body readers, and the cookie header codec.
export type { BoundedReadOptions } from "./body"
export { PayloadTooLargeError, readBoundedBytes, readBoundedText } from "./body"
export type { CookieAttributes, CookieSameSite } from "./cookie"
export {
  isCookieNameToken,
  isCookiePath,
  MAX_COOKIE_BYTES,
  parseCookieHeader,
  readCookie,
  serializeCookieAttributes,
} from "./cookie"
export { resolveFetch } from "./fetch"
export type {
  WebAbortController,
  WebAbortSignal,
  WebBodyInit,
  WebFetch,
  WebHeaders,
  WebHeadersInit,
  WebReadableStream,
  WebReadableStreamDefaultReader,
  WebRequest,
  WebRequestInit,
  WebResponse,
  WebResponseInit,
  WebTextDecoder,
  WebTextEncoder,
  WebURL,
  WebURLSearchParams,
} from "./types"
