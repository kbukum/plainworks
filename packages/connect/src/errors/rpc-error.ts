import { Code, ConnectError } from "@connectrpc/connect"
import { type Failure, FailureDecodeError, RemoteFailure } from "@plainworks/std/failure"
import type { WebHeaders } from "@plainworks/std/web"
import { decodeRpcFailure } from "./rpc-details"

/**
 * Protocol status, separate from the shared application failure code.
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
  /** Original details, including unknown extensions, preserved for diagnostics. */
  readonly details?: Readonly<ConnectError["details"]>
  /** Trailing/response metadata (headers) attached to the error. */
  readonly metadata?: WebHeaders
  /** Underlying cause — typically the originating `ConnectError` — preserved so nothing is swallowed. */
  readonly cause?: unknown
}

/**
 * Shared remote failure with independently preserved Connect protocol identity.
 * Malformed known details become operational failures, never form violations.
 */
export class RpcError extends RemoteFailure<`connect/${RpcErrorCode}`> {
  override readonly name: string = "RpcError"
  override readonly fieldPathFormat = "protobuf"
  readonly rpcCode: RpcErrorCode
  /** Original numeric Connect code, preserved for interop. */
  readonly rawCode: Code
  /** Original server details, retained alongside the decoded shared fields. */
  readonly details: Readonly<ConnectError["details"]>
  /** Trailing/response metadata attached to the error. */
  readonly metadata: WebHeaders

  constructor(message: string, init: RpcErrorInit) {
    const code = CODE_TO_RPC_CODE[init.rawCode] ?? "unknown"
    let failure: Failure
    let cause = init.cause
    try {
      failure = decodeRpcFailure(init.rawCode, message, init.details ?? [])
    } catch (error) {
      if (!(error instanceof FailureDecodeError)) throw error
      failure = error
      cause = new FailureDecodeError({ cause: init.cause ?? error })
    }
    super(`connect/${code}`, failure, { cause })
    this.rpcCode = code
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
 * The transport and Query adapters call it outside interceptor normalization. Consumers already
 * receive RpcError; custom transport integrations may use this boundary explicitly.
 */
export function mapConnectError(reason: unknown): RpcError {
  if (reason instanceof RpcError) return reason
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
