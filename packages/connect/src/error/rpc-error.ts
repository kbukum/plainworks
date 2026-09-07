import { Code, ConnectError } from "@connectrpc/connect"
import { PlainError, type WebHeaders } from "@plainworks/std"

/**
 * Stable, transport-agnostic RPC error code — the gRPC/Connect code set as snake_case string
 * literals. It is the kit's typed error surface: consumers switch on {@link RpcError.code} instead of
 * the numeric Connect {@link Code} enum, and it doubles as the {@link RpcError} `kind` discriminant
 * (`connect/${code}`), matching the `PlainError` model used across plainworks.
 */
export type RpcErrorCode =
  | "canceled"
  | "unknown"
  | "invalid_argument"
  | "deadline_exceeded"
  | "not_found"
  | "already_exists"
  | "permission_denied"
  | "resource_exhausted"
  | "failed_precondition"
  | "aborted"
  | "out_of_range"
  | "unimplemented"
  | "internal"
  | "unavailable"
  | "data_loss"
  | "unauthenticated"

const CODE_TO_RPC_CODE: Record<Code, RpcErrorCode> = {
  [Code.Canceled]: "canceled",
  [Code.Unknown]: "unknown",
  [Code.InvalidArgument]: "invalid_argument",
  [Code.DeadlineExceeded]: "deadline_exceeded",
  [Code.NotFound]: "not_found",
  [Code.AlreadyExists]: "already_exists",
  [Code.PermissionDenied]: "permission_denied",
  [Code.ResourceExhausted]: "resource_exhausted",
  [Code.FailedPrecondition]: "failed_precondition",
  [Code.Aborted]: "aborted",
  [Code.OutOfRange]: "out_of_range",
  [Code.Unimplemented]: "unimplemented",
  [Code.Internal]: "internal",
  [Code.Unavailable]: "unavailable",
  [Code.DataLoss]: "data_loss",
  [Code.Unauthenticated]: "unauthenticated",
}

/** Construction inputs for an {@link RpcError}. */
export interface RpcErrorInit {
  /** Original numeric Connect code, preserved for interop with Connect tooling. */
  readonly rawCode: Code
  /**
   * Structured error details attached by the server, if any. Kept **raw/undecoded** on purpose: a
   * registry-less kit cannot type-decode arbitrary `google.protobuf.Any` details, so consumers that
   * need them decode against their own message registry.
   */
  readonly details?: readonly unknown[]
  /** Trailing/response metadata (headers) attached to the error. */
  readonly metadata?: WebHeaders
  /** Underlying cause — typically the originating `ConnectError` — preserved so nothing is swallowed. */
  readonly cause?: unknown
}

/**
 * Typed error raised at the Connect boundary. Extends `PlainError`, so its `kind` is
 * `connect/${code}` (e.g. `connect/not_found`) — the same shape every plainworks package uses — while
 * {@link RpcError.code} exposes the bare {@link RpcErrorCode} for switch-on-code handling. The
 * originating `ConnectError` is preserved as `cause`. The string `code` is **derived from
 * `rawCode`**, so `kind`, `code`, and `rawCode` always describe one failure — a contradictory
 * pairing is unrepresentable.
 */
export class RpcError extends PlainError<`connect/${RpcErrorCode}`> {
  /** Stable string code, derived from {@link RpcError.rawCode} and mirrored in the `kind` discriminant. */
  readonly code: RpcErrorCode
  /** Original numeric Connect code, preserved for interop. */
  readonly rawCode: Code
  /** Raw, undecoded server error details (empty when none). */
  readonly details: readonly unknown[]
  /** Trailing/response metadata attached to the error. */
  readonly metadata: WebHeaders

  constructor(message: string, init: RpcErrorInit) {
    const code = CODE_TO_RPC_CODE[init.rawCode] ?? "unknown"
    super(`connect/${code}`, message, init.cause !== undefined ? { cause: init.cause } : undefined)
    this.code = code
    this.rawCode = init.rawCode
    this.details = init.details ?? []
    this.metadata = init.metadata ?? new Headers()
  }
}

/**
 * Normalize any thrown value into the kit's typed {@link RpcError}. Uses `ConnectError.from`, so a
 * plain network failure, an abort, and a `ConnectError` all map to one stable shape without losing
 * the original cause.
 *
 * This is a **boundary** mapper, called where the consumer reads the failure (a query error boundary
 * or a `catch` site) — never inside a transport interceptor, because Connect re-normalizes any
 * interceptor-thrown value back into a `ConnectError`, discarding a custom type.
 */
export function mapConnectError(reason: unknown): RpcError {
  const connectError = ConnectError.from(reason)
  return new RpcError(connectError.rawMessage, {
    rawCode: connectError.code,
    details: connectError.details,
    metadata: connectError.metadata,
    cause: connectError,
  })
}

/** Narrow an unknown value to {@link RpcError}. */
export function isRpcError(value: unknown): value is RpcError {
  return value instanceof RpcError
}
