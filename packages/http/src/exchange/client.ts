import {
  type AuthHeaderProvider,
  composeInterceptors,
  type Delay,
  type InferSchemaOutput,
  isErr,
  type RandomSource,
  type RedactOptions,
  type RetryDeps,
  RetryError,
  type RetryPolicy,
  runWithRetry,
  type StandardSchemaV1,
  systemDelay,
  systemRandom,
  TimeoutError,
  validateWithSchema,
  type WebAbortSignal,
  type WebBodyInit,
  type WebHeaders,
  type WebHeadersInit,
  type WebRequestInit,
  type WebResponse,
  withTimeout,
} from "@plainworks/std"
import { type BodyCodec, jsonCodec } from "../codec"
import { HttpError } from "../error"
import {
  authHeaderInterceptor,
  type HttpHandler,
  type HttpInterceptor,
  loggingInterceptor,
  type ObservabilityHooks,
} from "../interceptor"
import { assertSafeRequestUrl, buildUrl, type QueryParams } from "../url"
import { type HttpRequest, toRequestInit } from "./request"
import type { RequestInput } from "./request-input"
import { createResourceMethods, type ResourceMethods } from "./resource"
import type { HttpResponse } from "./response"
import { parseRetryAfterMs, resolveRetryPolicy } from "./retry"

/** The `fetch` shape the client depends on — injectable so tests drive the boundary without a network. */
export type FetchLike = (input: string, init?: WebRequestInit) => Promise<WebResponse>

const DEFAULT_TIMEOUT_MS = 30_000

/** Construction options for {@link createHttpClient}. */
export interface HttpClientOptions {
  /** Absolute base every request path resolves against. */
  readonly baseUrl?: string
  /** Default headers merged into every request (a per-request header wins on conflict). */
  readonly headers?: WebHeadersInit
  /** Override the `fetch` implementation; defaults to the global `fetch`. */
  readonly fetch?: FetchLike
  /** Header-only credential seam; when set, its headers are injected on every attempt. */
  readonly authProvider?: AuthHeaderProvider
  /** Extra interceptors, ordered outermost-first, run between logging and auth injection. */
  readonly interceptors?: readonly HttpInterceptor[]
  /** Body encode/decode seam; defaults to {@link jsonCodec}. */
  readonly codec?: BodyCodec
  /** Per-attempt timeout in ms; defaults to 30s. */
  readonly timeoutMs?: number
  /** Retry policy; when omitted, each request makes a single attempt. */
  readonly retry?: RetryPolicy
  /** Redacted observability sink around each request. */
  readonly observability?: ObservabilityHooks
  /** Redaction options applied before values reach {@link HttpClientOptions.observability}. */
  readonly redact?: RedactOptions
  /** Injectable delay for deterministic timeout/backoff tests; defaults to the host timer. */
  readonly delay?: Delay
  /** Injectable jitter source for deterministic retry tests; defaults to the system RNG. */
  readonly random?: RandomSource
  /** Injectable clock (ms) for deterministic `Retry-After` date parsing; defaults to `Date.now`. */
  readonly now?: () => number
}

/**
 * A typed fetch client. Build one per request scope via {@link createHttpClient} — no module
 * singleton.
 *
 * `request` is the low-level call returning the full {@link HttpResponse} (status, headers, final
 * URL, decoded body). The {@link ResourceMethods} (`get`/`post`/`put`/`patch`/`delete`) are the
 * ergonomic surface over it: they preset the method, handle idempotency-key writes, and resolve to
 * the decoded body for the common case.
 *
 * A request with a `schema` validates the untrusted body and resolves to the schema's inferred
 * type; a request without one resolves to `unknown`, so the wire is never silently trusted as a
 * caller-chosen `T`.
 */
export interface HttpClient extends ResourceMethods {
  request<S extends StandardSchemaV1>(
    input: RequestInput & { readonly schema: S },
  ): Promise<HttpResponse<InferSchemaOutput<S>>>
  request(input: RequestInput): Promise<HttpResponse<unknown>>
}

/**
 * Build a typed fetch client. The client resolves and encodes the request, runs it through the
 * interceptor chain (logging → caller interceptors → auth injection → `fetch`), bounds each attempt
 * with a timeout, retries idempotent failures per the policy using the shared `std` resilience
 * primitives, maps failures to a typed {@link HttpError}, and decodes the body with the codec. It
 * holds no module-level state and performs no work until a request is made.
 */
export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const fetchImpl = options.fetch ?? resolveGlobalFetch()
  const codec = options.codec ?? jsonCodec
  const delay = options.delay ?? systemDelay
  const random = options.random ?? systemRandom
  const now = options.now ?? (() => Date.now())

  const interceptors: HttpInterceptor[] = []
  if (options.observability !== undefined) {
    interceptors.push(loggingInterceptor(options.observability, options.redact))
  }
  if (options.interceptors !== undefined) {
    interceptors.push(...options.interceptors)
  }
  if (options.authProvider !== undefined) {
    // Innermost, closest to `fetch`, so the credential is injected last on every attempt.
    interceptors.push(authHeaderInterceptor(options.authProvider))
  }

  // Compose the interceptor chain once; the terminal (which captures the final outbound URL and
  // guards the destination) is built per request so its capture stays request-scoped and safe under
  // concurrency.
  const composeChain = composeInterceptors(interceptors)

  function request<S extends StandardSchemaV1>(
    input: RequestInput & { readonly schema: S },
  ): Promise<HttpResponse<InferSchemaOutput<S>>>
  function request(input: RequestInput): Promise<HttpResponse<unknown>>
  async function request(input: RequestInput): Promise<HttpResponse<unknown>> {
    const method = input.method ?? "GET"
    const urlInput: { baseUrl?: string; path: string; query?: QueryParams } = { path: input.path }
    if (options.baseUrl !== undefined) {
      urlInput.baseUrl = options.baseUrl
    }
    if (input.query !== undefined) {
      urlInput.query = input.query
    }
    const url = buildUrl(urlInput)
    const headers = new Headers(options.headers)
    if (input.headers !== undefined) {
      new Headers(input.headers).forEach((value, key) => {
        headers.set(key, value)
      })
    }
    let body: WebBodyInit | undefined
    if (input.body !== undefined) {
      if (method === "GET" || method === "HEAD") {
        // The fetch standard forbids a body on GET/HEAD; refuse it here as a fatal caller-config
        // fault rather than letting the transport throw an opaque error at send time.
        throw HttpError.request(`A ${method} request must not carry a body.`)
      }
      const encoded = codec.encode(input.body)
      body = encoded.body
      if (!headers.has("content-type")) {
        headers.set("content-type", encoded.contentType)
      }
    }
    const base: HttpRequest =
      body === undefined ? { method, url, headers } : { method, url, headers, body }
    const timeoutMs = input.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS

    // The intended destination is the origin of the URL we built; an interceptor that rewrites the
    // URL across origins must not carry the injected credential to a different host.
    const expectedOrigin = originOf(url)
    // The terminal records the final outbound URL (after every interceptor rewrite) so the response
    // can fall back to it when the transport does not report one; request-scoped for concurrency.
    const outbound = { url }
    const handler = composeChain(makeTerminal(fetchImpl, expectedOrigin, outbound))

    const attempt = (outerSignal?: WebAbortSignal): Promise<HttpResponse<unknown>> => {
      const timeoutOptions: { signal?: WebAbortSignal; delay?: Delay } = { delay }
      if (outerSignal !== undefined) {
        timeoutOptions.signal = outerSignal
      }
      return withTimeout(
        async (timeoutSignal) => {
          // Clone the base headers per attempt: an interceptor that mutates the request headers in
          // place must not accumulate changes into a later retry — every attempt starts from the
          // same base request.
          const response = await handler({
            ...base,
            headers: new Headers(base.headers),
            signal: timeoutSignal,
          })
          // Classify the status here, after the whole chain has run, so a non-2xx response is a
          // typed failure whether the transport produced it or an interceptor short-circuited with
          // one — a status error can never slip past by bypassing the terminal handler.
          if (!response.ok) {
            const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"), now())
            const statusOptions: { retryAfterMs?: number; cause?: unknown } = { cause: response }
            if (retryAfterMs !== undefined) {
              statusOptions.retryAfterMs = retryAfterMs
            }
            // Release the failed response's body/connection before raising, so a retry loop can't
            // pin an unread stream per attempt and exhaust the transport pool.
            await cancelBody(response)
            throw HttpError.status(response.status, statusOptions)
          }
          // Decode under the attempt's timeout/abort signal so a response that sends headers and
          // then stalls its body cannot hang forever and post-headers cancellation is still
          // honored.
          const decoded = await codec.decode(response, timeoutSignal)
          // The wire is untrusted: validate the decoded body against the caller's schema at the
          // boundary (no schema → the raw `unknown` is returned, never a fabricated `T`). An empty
          // body is `undefined` and has nothing to validate.
          const data =
            input.schema === undefined || decoded === undefined
              ? decoded
              : await validateBody(input.schema, decoded)
          return {
            status: response.status,
            headers: response.headers,
            // Fall back to the final outbound URL (after any interceptor rewrite), not the
            // pre-interceptor build, when the transport reports no response URL.
            url: response.url || outbound.url,
            data,
          }
        },
        timeoutMs,
        timeoutOptions,
      ).catch((error: unknown) => {
        // A per-attempt deadline surfaces as a std TimeoutError; remap it to a typed, retryable
        // http/timeout so the caller keeps a single HttpError contract and the retry driver can
        // back off and try again. A caller cancellation (AbortError) is left untouched.
        if (error instanceof TimeoutError) {
          throw HttpError.timeout({ cause: error })
        }
        throw error
      })
    }

    const policy = resolveRetryPolicy(input.retry ?? options.retry, method, input.idempotent)
    if (policy === undefined) {
      return attempt(input.signal)
    }
    const retryDeps: RetryDeps =
      input.signal === undefined ? { delay, random } : { delay, random, signal: input.signal }
    try {
      return await runWithRetry((_attempt, signal) => attempt(signal), policy, retryDeps)
    } catch (error) {
      throw unwrapRetryError(error)
    }
  }

  return { request, ...createResourceMethods(request) }
}

/**
 * Validate a decoded, untrusted response body against the caller's Standard Schema at the trust
 * boundary. On success the parsed, typed value is returned; a validation failure is mapped to a
 * fatal `http/validate` {@link HttpError} that preserves the issues as `cause`, so an invalid body
 * never escapes the typed error model as a fabricated value.
 */
async function validateBody(schema: StandardSchemaV1, decoded: unknown): Promise<unknown> {
  const result = await validateWithSchema(schema, decoded)
  if (isErr(result)) {
    throw HttpError.validate(result.error)
  }
  return result.value
}

/**
 * Best-effort teardown of a response body. Cancellation frees the underlying connection/stream; a
 * body that refuses to cancel must never mask the error being raised, so failures are swallowed.
 */
async function cancelBody(response: WebResponse): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // Intentionally ignored — teardown is best-effort.
  }
}

/**
 * When retries are exhausted the shared driver wraps the final failure in a {@link RetryError}.
 * Surface the underlying cause so a caller sees the actual last failure — its typed
 * {@link HttpError} discriminant (`http/status` | `http/network` | `http/timeout` | …), `status`,
 * and `category` — on an exhausted request, instead of a generic `std/retry-exhausted` error it
 * would have to unwrap by hand.
 */
function unwrapRetryError(error: unknown): unknown {
  if (error instanceof RetryError && error.cause !== undefined) {
    return error.cause
  }
  return error
}

/**
 * Build the terminal pipeline step for a single request. It re-runs the credential guards on the
 * final URL (an interceptor may have rewritten it), refuses a rewrite that would ship the injected
 * credential to a different origin, records the final outbound URL for the response fallback, then
 * calls the transport — mapping a non-abort transport failure to a typed network error.
 */
function makeTerminal(
  fetchImpl: FetchLike,
  expectedOrigin: string,
  outbound: { url: string },
): HttpHandler {
  return async (request) => {
    // An interceptor may have rewritten the URL after buildUrl ran; re-run the credential guards on
    // the final URL so a reintroduced userinfo credential or credential-shaped query never reaches
    // the wire (header-only auth), regardless of what the chain did.
    assertSafeRequestUrl(request.url)
    // A rewrite that also crossed origins would deliver the injected Authorization (or a cookie) to
    // a different host than the caller targeted; refuse it rather than leak the credential.
    assertNoCrossOriginCredentialLeak(request.url, expectedOrigin, request.headers)
    outbound.url = request.url
    try {
      return await fetchImpl(request.url, toRequestInit(request))
    } catch (cause) {
      // A cancellation raised by the timeout/caller signal is already the settled outcome upstream;
      // let it through rather than masking it as a network fault.
      if (isAbort(cause)) {
        throw cause
      }
      throw HttpError.network({ cause })
    }
  }
}

/** Request headers that carry a credential and must never cross to an unintended origin. */
const CREDENTIAL_HEADERS = ["authorization", "cookie", "proxy-authorization"] as const

/**
 * Refuse to send a credential across origins. When an interceptor rewrites the URL to a different
 * origin than the request targeted and a credential header is present, the injected credential
 * would leak to that host — a fatal unsafe-url fault, not a silent send. Same-origin rewrites are
 * allowed.
 */
function assertNoCrossOriginCredentialLeak(
  finalUrl: string,
  expectedOrigin: string,
  headers: WebHeaders,
): void {
  if (originOf(finalUrl) === expectedOrigin) {
    return
  }
  for (const name of CREDENTIAL_HEADERS) {
    if (headers.has(name)) {
      throw HttpError.unsafeUrl(
        "Refusing to send a credential to a different origin than the request targeted; an interceptor rewrote the URL across origins.",
      )
    }
  }
}

/** The origin of an already-validated absolute URL string. */
function originOf(rawUrl: string): string {
  return new URL(rawUrl).origin
}

function resolveGlobalFetch(): FetchLike {
  if (typeof fetch !== "function") {
    throw HttpError.network({
      message: "No global fetch is available; pass options.fetch to createHttpClient.",
    })
  }
  return (input, init) => fetch(input, init)
}

function isAbort(value: unknown): boolean {
  return value instanceof Error && value.name === "AbortError"
}
