import { isRecord, type RedactOptions, redact, type WebHeaders, type WebURL } from "@plainworks/std"
import type { HttpRequest } from "../exchange/request"
import type { HttpInterceptor } from "./handler"

/** A redacted view of an outbound request, safe to hand to a log sink. */
export interface LoggedRequest {
  readonly method: string
  readonly url: string
  readonly headers: Record<string, unknown>
}

/** A redacted view of a response, safe to hand to a log sink. */
export interface LoggedResponse {
  readonly status: number
  readonly url: string
  readonly headers: Record<string, unknown>
}

/** Observability sink invoked around each request. Every payload is redacted before it arrives. */
export interface ObservabilityHooks {
  onRequest?(request: LoggedRequest): void
  onResponse?(response: LoggedResponse): void
  onError?(error: unknown, request: LoggedRequest): void
}

function headersToObject(headers: WebHeaders): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    result[key] = value
  })
  return result
}

/**
 * Reduce a URL to a form safe for a log sink: strip any userinfo (`user:pass@`), query string, and
 * fragment, keeping only scheme, host, and path. `response.url` and hand-built request URLs are
 * server- or caller-controlled and can carry an `access_token`, a signed-URL signature, or a
 * fragment credential in the query/fragment (header-only auth is the rule, but a smuggled value must
 * still never be logged). A value that does not parse as a URL is reduced to a fixed placeholder
 * rather than passed through — the raw string could itself be a credential-bearing token, so it must
 * never reach the sink verbatim.
 */
function sanitizeUrl(rawUrl: string): string {
  let parsed: WebURL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return "[unparsable-url]"
  }
  parsed.username = ""
  parsed.password = ""
  parsed.search = ""
  parsed.hash = ""
  return parsed.toString()
}

/**
 * Read a property from an error without invoking any accessor: walk the prototype chain for the
 * first descriptor, so a non-enumerable `name`/`message`/`cause` on `Error.prototype` is still found.
 */
function findDescriptor(target: object, key: string): PropertyDescriptor | undefined {
  let current: object | null = target
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key)
    if (descriptor !== undefined) {
      return descriptor
    }
    current = Object.getPrototypeOf(current)
  }
  return undefined
}

/**
 * Build a plain, structural view of an error for redaction. `name`/`message`/`cause` are
 * non-enumerable on the `Error` prototype, so a naive object walk would miss them; each is read via
 * its descriptor and any accessor is surfaced as `"[Getter]"` rather than invoked, so logging an
 * untrusted error never executes getter code that could leak a secret or throw.
 */
function describeErrorSafely(error: Error): Record<string, unknown> {
  const view: Record<string, unknown> = {}
  const surface = (key: string, descriptor: PropertyDescriptor | undefined): void => {
    if (descriptor === undefined) {
      return
    }
    view[key] = descriptor.get !== undefined ? "[Getter]" : descriptor.value
  }
  surface("name", findDescriptor(error, "name"))
  surface("message", findDescriptor(error, "message"))
  for (const key of Object.keys(error)) {
    if (key === "name" || key === "message" || key === "cause") {
      continue
    }
    surface(key, Object.getOwnPropertyDescriptor(error, key))
  }
  const cause = findDescriptor(error, "cause")
  if (cause !== undefined && (cause.get !== undefined || cause.value !== undefined)) {
    surface("cause", cause)
  }
  return view
}

/**
 * Reduce a thrown value to a redacted, structural view safe for a log sink. An error can carry a
 * credential in its `message` or in an enumerable field (a `fetch` failure, or a custom
 * interceptor's error), so a descriptor-safe view of the error — one that surfaces accessors instead
 * of invoking them — is passed through `std` {@link redact}: a token-shaped or embedded-secret
 * message is masked and a sensitively-named field is masked, while the discriminants an observer
 * needs (`name`, `kind`, `status`, …) survive. The original error is never handed across the
 * boundary; only this redacted copy is.
 */
function redactError(error: unknown, redactOptions?: RedactOptions): unknown {
  if (!(error instanceof Error)) {
    return redact(error, redactOptions)
  }
  return redact(describeErrorSafely(error), redactOptions)
}

/**
 * An interceptor that reports each request/response/error to {@link ObservabilityHooks}, running
 * every value through `std` {@link redact} first so a token or secret header (e.g. `authorization`,
 * `cookie`) is masked — the observability seam never logs a live credential or payload.
 */
export function loggingInterceptor(
  hooks: ObservabilityHooks,
  redactOptions?: RedactOptions,
): HttpInterceptor {
  const redactHeaders = (headers: WebHeaders): Record<string, unknown> => {
    // A headers object is flat, so clamp maxDepth to at least 1: a caller `maxDepth: 0` would
    // otherwise truncate the whole object to a "[Truncated]" string and the guard below would drop
    // every header. isRecord then guarantees the sink always receives a record, never a scalar.
    const options: RedactOptions =
      redactOptions?.maxDepth !== undefined && redactOptions.maxDepth < 1
        ? { ...redactOptions, maxDepth: 1 }
        : (redactOptions ?? {})
    const redacted = redact(headersToObject(headers), options)
    return isRecord(redacted) ? redacted : {}
  }
  const describe = (request: HttpRequest): LoggedRequest => ({
    method: request.method,
    url: sanitizeUrl(request.url),
    headers: redactHeaders(request.headers),
  })
  return (next) => async (request) => {
    hooks.onRequest?.(describe(request))
    try {
      const response = await next(request)
      hooks.onResponse?.({
        status: response.status,
        url: sanitizeUrl(response.url || request.url),
        headers: redactHeaders(response.headers),
      })
      return response
    } catch (error) {
      hooks.onError?.(redactError(error, redactOptions), describe(request))
      throw error
    }
  }
}
