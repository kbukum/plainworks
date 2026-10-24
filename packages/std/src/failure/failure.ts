import { PlainError, type PlainErrorOptions } from "../errors"
import type { FailureCode } from "./codes"

/** A safe message and semantic reason at a field path, or the whole request when empty. */
export interface Violation {
  readonly field: string
  readonly reason: string
  readonly message: string
}

/**
 * How a failure affects the borrowed session: `unauthenticated` ends it, `unavailable` means the
 * session could not be checked. Either one fails every protected operation closed.
 */
export type FailureAuthentication = "unauthenticated" | "unavailable"

/**
 * A remote failure in protocol-neutral terms: a canonical {@link FailureCode}, a safe message, and
 * the standard error details a server attached. Delays are milliseconds, never wire seconds.
 */
export interface Failure {
  readonly code: FailureCode
  readonly message: string
  /** Machine-readable cause: the `ErrorInfo` reason or the problem `type` URI. */
  readonly reason?: string | undefined
  /** Namespace of `reason`, such as the `ErrorInfo` domain. */
  readonly domain?: string | undefined
  /** String context the server attached, such as `ErrorInfo` metadata. */
  readonly metadata?: Readonly<Record<string, string>> | undefined
  readonly traceId?: string | undefined
  readonly violations: readonly Violation[]
  readonly retryable: boolean
  readonly retryAfterMs?: number | undefined
  /** Defaults to `unauthenticated` for that code; a decoder may report `unavailable`. */
  readonly authentication?: FailureAuthentication | undefined
}

/** Remote data is for display/handling, not trusted onward public serialization. */
export class RemoteFailure<Kind extends string = string>
  extends PlainError<Kind>
  implements Failure
{
  override readonly name: string = "RemoteFailure"
  readonly fieldPathFormat: "protobuf" | "json" = "json"
  readonly code: FailureCode
  readonly reason: string | undefined
  readonly domain: string | undefined
  readonly metadata: Readonly<Record<string, string>>
  readonly traceId: string | undefined
  readonly violations: readonly Violation[]
  /** Terminal authentication outcome; never permission for credential refresh or retries. */
  readonly authentication: FailureAuthentication | undefined
  readonly retryable: boolean
  readonly retryAfterMs: number | undefined

  constructor(kind: Kind, failure: Failure, options?: PlainErrorOptions) {
    super(kind, failure.message, options)
    this.code = failure.code
    this.reason = failure.reason
    this.domain = failure.domain
    this.metadata = failure.metadata ?? {}
    this.traceId = failure.traceId
    this.violations = failure.violations
    this.authentication =
      failure.authentication ?? (failure.code === "unauthenticated" ? "unauthenticated" : undefined)
    this.retryable = failure.retryable && this.authentication === undefined
    this.retryAfterMs = this.retryable ? failure.retryAfterMs : undefined
  }
}

/** A malformed upstream contract is operational, never a user's field error. */
export class FailureDecodeError extends RemoteFailure<"failure/decode"> {
  override readonly name: string = "FailureDecodeError"
  constructor(options?: PlainErrorOptions) {
    super(
      "failure/decode",
      {
        code: "internal",
        message: "The service returned an invalid failure response.",
        retryable: false,
        violations: [],
      },
      options,
    )
  }
}

/** An `UPPER_SNAKE_CASE` reason, as `google.rpc` recommends for `ErrorInfo` and violations. */
export function isViolationReason(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{0,62}$/.test(value)
}
