import { PlainError, type PlainErrorOptions } from "../errors"
import { isRecord } from "../guard"
import { type FailureCode, isFailureCode } from "./codes"

/** A safe message and semantic reason at a field path, or the whole request when empty. */
export interface Violation {
  readonly field: string
  readonly reason: string
  readonly message: string
}

/** Shared remote vocabulary. Delays are milliseconds, never wire seconds. */
export interface Failure {
  readonly code: FailureCode
  readonly message: string
  readonly reason?: string | undefined
  readonly traceId?: string | undefined
  readonly violations: readonly Violation[]
  readonly retryable: boolean
  readonly retryAfterMs?: number | undefined
}

/** Remote data is for display/handling, not trusted onward public serialization. */
export class RemoteFailure<Kind extends string = string>
  extends PlainError<Kind>
  implements Failure
{
  readonly fieldPathFormat: "protobuf" | "json" = "json"
  readonly code: FailureCode
  readonly reason: string | undefined
  readonly traceId: string | undefined
  readonly violations: readonly Violation[]
  readonly retryable: boolean
  readonly retryAfterMs: number | undefined

  constructor(kind: Kind, failure: Failure, options?: PlainErrorOptions) {
    super(kind, failure.message, options)
    this.code = failure.code
    this.reason = failure.reason
    this.traceId = failure.traceId
    this.violations = failure.violations
    this.retryable = failure.retryable && this.authentication === undefined
    this.retryAfterMs = this.retryable ? failure.retryAfterMs : undefined
  }

  /** Terminal authentication outcome; never permission for credential refresh or retries. */
  get authentication(): "unauthenticated" | undefined {
    return this.code === "UNAUTHORIZED" ||
      this.code === "TOKEN_EXPIRED" ||
      this.code === "INVALID_TOKEN"
      ? "unauthenticated"
      : undefined
  }
}

/** A malformed upstream contract is operational, never a user's field error. */
export class FailureDecodeError extends RemoteFailure<"failure/decode"> {
  constructor(options?: PlainErrorOptions) {
    super(
      "failure/decode",
      {
        code: "EXTERNAL_SERVICE_ERROR",
        message: "The service returned an invalid failure response.",
        retryable: false,
        violations: [],
      },
      options,
    )
  }
}

export function isViolationReason(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{0,62}$/.test(value)
}

/** Validate JSON failure fields; HTTP adapters supply `detail` as `message`. */
export function decodeFailure(value: unknown): Failure {
  if (
    !isRecord(value) ||
    !isFailureCode(value.code) ||
    typeof value.message !== "string" ||
    typeof value.retryable !== "boolean" ||
    (value.reason !== undefined && !isViolationReason(value.reason)) ||
    (value.traceId !== undefined && typeof value.traceId !== "string")
  ) {
    throw new FailureDecodeError()
  }
  const violations: Violation[] = []
  if (value.violations !== undefined) {
    if (!Array.isArray(value.violations)) throw new FailureDecodeError()
    for (const entry of value.violations) {
      if (
        !isRecord(entry) ||
        typeof entry.field !== "string" ||
        !isViolationReason(entry.reason) ||
        typeof entry.message !== "string"
      ) {
        throw new FailureDecodeError()
      }
      violations.push({ field: entry.field, reason: entry.reason, message: entry.message })
    }
  }
  let retryAfterMs: number | undefined
  if (value.retryAfter !== undefined) {
    if (
      typeof value.retryAfter !== "number" ||
      !Number.isFinite(value.retryAfter) ||
      value.retryAfter < 0 ||
      value.retryAfter * 1000 > Number.MAX_SAFE_INTEGER
    ) {
      throw new FailureDecodeError()
    }
    retryAfterMs = value.retryable ? Math.ceil(value.retryAfter * 1000) : undefined
  }
  return {
    code: value.code,
    message: value.message,
    retryable: value.retryable,
    retryAfterMs,
    reason: typeof value.reason === "string" ? value.reason : undefined,
    traceId: typeof value.traceId === "string" ? value.traceId : undefined,
    violations,
  }
}
