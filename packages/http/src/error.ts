import {
  classifyStatus,
  type FailureCategory,
  PlainError,
  type StandardSchemaIssue,
} from "@plainworks/std"

/** Discriminants for every failure the client raises, so a caller can branch on the failure kind. */
export type HttpErrorKind =
  | "http/status"
  | "http/network"
  | "http/timeout"
  | "http/unsafe-url"
  | "http/request"
  | "http/encode"
  | "http/decode"
  | "http/validate"

interface HttpErrorFields {
  readonly status: number | undefined
  readonly category: FailureCategory
  readonly retryable: boolean
  readonly retryAfterMs: number | undefined
}

/**
 * The one typed error every `@plainworks/http` failure surfaces as. It carries the HTTP `status`
 * (for a response failure), the shared {@link FailureCategory}, and a `retryable` verdict decided by
 * the `std` classifier — never re-derived per protocol — plus an optional `Retry-After` hint the
 * retry driver honors. `retryable` lets the retry policy decide from the error alone without
 * re-instanceof-ing every transport error type.
 */
export class HttpError extends PlainError<HttpErrorKind> {
  /** HTTP status of a response failure; `undefined` for a network, URL, or decode failure. */
  readonly status: number | undefined
  /** Coarse failure family shared with the `std` classifier (network / timeout / auth / …). */
  readonly category: FailureCategory
  /** Whether the shared classifier considers this failure worth retrying (idempotent calls only). */
  readonly retryable: boolean
  /** A parsed `Retry-After` delay hint in milliseconds, or `undefined` when the server gave none. */
  readonly retryAfterMs: number | undefined

  private constructor(
    kind: HttpErrorKind,
    message: string,
    fields: HttpErrorFields,
    options?: { cause?: unknown },
  ) {
    super(kind, message, options)
    this.status = fields.status
    this.category = fields.category
    this.retryable = fields.retryable
    this.retryAfterMs = fields.retryAfterMs
  }

  /** A non-2xx response. Category and retryability come from {@link classifyStatus}. */
  static status(status: number, options?: { retryAfterMs?: number; cause?: unknown }): HttpError {
    const { category, disposition } = classifyStatus(status)
    return new HttpError(
      "http/status",
      `Request failed with status ${status}`,
      {
        status,
        category,
        retryable: disposition === "retryable",
        retryAfterMs: options?.retryAfterMs,
      },
      options,
    )
  }

  /** A transport-level failure (the `fetch` call threw): a retryable network fault. */
  static network(options?: { message?: string; cause?: unknown }): HttpError {
    return new HttpError(
      "http/network",
      options?.message ?? "Network request failed",
      { status: undefined, category: "network", retryable: true, retryAfterMs: undefined },
      options,
    )
  }

  /**
   * A single attempt exceeded its per-attempt deadline (the request `AbortSignal` fired on a
   * timeout, not a caller cancellation). Retryable for an idempotent call — a slow hop may succeed
   * on the next attempt — so the retry driver can back off and try again.
   */
  static timeout(options?: { message?: string; cause?: unknown }): HttpError {
    return new HttpError(
      "http/timeout",
      options?.message ?? "Request timed out",
      { status: undefined, category: "timeout", retryable: true, retryAfterMs: undefined },
      options,
    )
  }

  /** A refused URL — e.g. a credential-shaped query parameter or an unresolvable base/path. Fatal. */
  static unsafeUrl(message: string, options?: { cause?: unknown }): HttpError {
    return new HttpError(
      "http/unsafe-url",
      message,
      { status: undefined, category: "protocol", retryable: false, retryAfterMs: undefined },
      options,
    )
  }

  /**
   * A malformed request the client refuses to send — e.g. a body on a `GET`/`HEAD`, which the fetch
   * standard forbids. A caller-config fault, not a transport fault, so it is fatal (retrying the
   * same request reproduces it).
   */
  static request(message: string, options?: { cause?: unknown }): HttpError {
    return new HttpError(
      "http/request",
      message,
      { status: undefined, category: "protocol", retryable: false, retryAfterMs: undefined },
      options,
    )
  }

  /** The response body could not be decoded by the codec. Fatal (retrying yields the same body). */
  static decode(options?: { message?: string; cause?: unknown }): HttpError {
    return new HttpError(
      "http/decode",
      options?.message ?? "Failed to decode the response body",
      { status: undefined, category: "protocol", retryable: false, retryAfterMs: undefined },
      options,
    )
  }

  /** The request body could not be encoded by the codec (e.g. a cyclic or non-serializable value). Fatal. */
  static encode(options?: { message?: string; cause?: unknown }): HttpError {
    return new HttpError(
      "http/encode",
      options?.message ?? "Failed to encode the request body",
      { status: undefined, category: "protocol", retryable: false, retryAfterMs: undefined },
      options,
    )
  }

  /**
   * The decoded response body was rejected by the caller's Standard Schema validator at the trust
   * boundary. Fatal (retrying yields the same body). The validation `issues` are preserved as
   * `cause` so a caller can inspect exactly which fields failed.
   */
  static validate(
    issues: ReadonlyArray<StandardSchemaIssue>,
    options?: { cause?: unknown },
  ): HttpError {
    return new HttpError(
      "http/validate",
      `Response body failed schema validation: ${summarizeIssues(issues)}`,
      { status: undefined, category: "protocol", retryable: false, retryAfterMs: undefined },
      { cause: options?.cause ?? issues },
    )
  }
}

/** Render validation issues into a compact, log-safe message: the first issue's path and message plus a count. */
function summarizeIssues(issues: ReadonlyArray<StandardSchemaIssue>): string {
  const [first] = issues
  if (first === undefined) {
    return "unknown validation error"
  }
  const path =
    first.path === undefined || first.path.length === 0 ? "" : `${formatPath(first.path)}: `
  const more = issues.length > 1 ? ` (+${issues.length - 1} more)` : ""
  return `${path}${first.message}${more}`
}

/** Join an issue path into a dotted key string (`items.0.name`), reading a structured segment's `key`. */
function formatPath(path: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>): string {
  return path
    .map((segment) => (typeof segment === "object" ? String(segment.key) : String(segment)))
    .join(".")
}

/** Narrow an unknown thrown value to an {@link HttpError}. */
export function isHttpError(value: unknown): value is HttpError {
  return value instanceof HttpError
}
