// Re-export-only barrel for the web concern: structural types for the universal WHATWG surface and
// the cookie header codec.
export type { CookieAttributes, CookieSameSite } from "./cookie"
export {
  isCookieNameToken,
  isCookiePath,
  MAX_COOKIE_BYTES,
  parseCookieHeader,
  serializeCookieAttributes,
  utf8ByteLength,
} from "./cookie"
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
} from "./types"
