import type { RetryPolicy, StandardSchemaV1, WebAbortSignal, WebHeadersInit } from "@plainworks/std"
import type { HttpMethod } from "../method"
import type { QueryParams } from "../url"

/**
 * The caller-facing input to a client request. It is the ergonomic surface both `request` and the {@link ResourceMethods} resolve — path/query/headers/body plus the resilience and validation knobs — which the client then encodes into the internal {@link HttpRequest} unit.
 */
export interface RequestInput {
  /** HTTP method; defaults to `GET`. */
  readonly method?: HttpMethod
  /** Path relative to the client's `baseUrl`, or a full URL when no base is set. */
  readonly path: string
  /** Typed query parameters (credential-shaped keys are rejected). */
  readonly query?: QueryParams
  /** Per-request headers, merged over the client defaults. */
  readonly headers?: WebHeadersInit
  /** Request body; encoded by the codec. */
  readonly body?: unknown
  /** Caller cancellation — aborts the in-flight attempt and any pending backoff. */
  readonly signal?: WebAbortSignal
  /** Force retry eligibility regardless of method (e.g. a `POST` known to be safe to repeat). */
  readonly idempotent?: boolean
  /** Override the per-attempt timeout for this request. */
  readonly timeoutMs?: number
  /** Override the retry policy for this request. */
  readonly retry?: RetryPolicy
  /**
   * Standard Schema validator applied to the decoded response body at the trust boundary. When present it both validates the untrusted body and infers the response type; a validation failure raises a typed `http/validate` {@link HttpError}. Omit it to receive the raw decoded `unknown` and narrow it yourself, or pass `unsafePassthrough<T>()` from `@plainworks/std` to opt explicitly into an unchecked `T` — the unvalidated passthrough is never the silent default.
   */
  readonly schema?: StandardSchemaV1
}
