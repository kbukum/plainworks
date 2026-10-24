/**
 * The canonical status codes shared by gRPC, Connect and `google.rpc.Code`, in their Connect
 * spelling. Every remote failure carries one, whatever protocol delivered it.
 */
export const failureCodes = [
  "canceled",
  "unknown",
  "invalid_argument",
  "deadline_exceeded",
  "not_found",
  "already_exists",
  "permission_denied",
  "resource_exhausted",
  "failed_precondition",
  "aborted",
  "out_of_range",
  "unimplemented",
  "internal",
  "unavailable",
  "data_loss",
  "unauthenticated",
] as const

export type FailureCode = (typeof failureCodes)[number]

const codes: ReadonlySet<string> = new Set(failureCodes)

export function isFailureCode(value: unknown): value is FailureCode {
  return typeof value === "string" && codes.has(value)
}

// The HTTP mapping documented by `google.rpc.Code` and the Connect protocol.
const httpStatuses: Readonly<Record<FailureCode, number>> = {
  canceled: 499,
  unknown: 500,
  invalid_argument: 400,
  deadline_exceeded: 504,
  not_found: 404,
  already_exists: 409,
  permission_denied: 403,
  resource_exhausted: 429,
  failed_precondition: 400,
  aborted: 409,
  out_of_range: 400,
  unimplemented: 501,
  internal: 500,
  unavailable: 503,
  data_loss: 500,
  unauthenticated: 401,
}

/** The HTTP status a server sends for `code`, per the `google.rpc.Code` mapping. */
export function httpStatusFor(code: FailureCode): number {
  return httpStatuses[code]
}

/**
 * The canonical code for an HTTP status: the inverse of the `google.rpc.Code` mapping, where
 * ambiguous statuses take their most general code (`400` is `invalid_argument`, `409` is
 * `aborted`), plus `408` and `422`. Any other `4xx` is `failed_precondition`, any other `5xx` is
 * `internal`, and anything else is `unknown`.
 */
export function failureCodeForStatus(status: number): FailureCode {
  switch (status) {
    case 400:
    case 422:
      return "invalid_argument"
    case 401:
      return "unauthenticated"
    case 403:
      return "permission_denied"
    case 404:
      return "not_found"
    case 408:
    case 504:
      return "deadline_exceeded"
    case 409:
      return "aborted"
    case 416:
      return "out_of_range"
    case 429:
      return "resource_exhausted"
    case 499:
      return "canceled"
    case 501:
      return "unimplemented"
    case 502:
    case 503:
      return "unavailable"
  }
  if (Number.isInteger(status) && status >= 400 && status < 500) return "failed_precondition"
  if (Number.isInteger(status) && status >= 500 && status < 600) return "internal"
  return "unknown"
}

/**
 * HTTP's default retry verdict for a failed status: `408`, `429` and every `5xx` may succeed on a
 * later attempt; any other status, and a non-integer one, will not. This is the one HTTP rule: the
 * problem decoder and the resilience classifier both read it. RPC failures follow their own
 * standard (`decodeRpcFailure` in `@plainworks/connect`), so the two protocols may disagree for a
 * failure that carries no explicit server verdict.
 */
export function isRetryableStatus(status: number): boolean {
  return (
    Number.isInteger(status) &&
    (status === 408 || status === 429 || (status >= 500 && status < 600))
  )
}
