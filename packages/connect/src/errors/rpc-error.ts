import { Code, ConnectError } from "@connectrpc/connect"
import {
  type Failure,
  type FailureCode,
  FailureDecodeError,
  RemoteFailure,
} from "@plainworks/std/failure"
import type { WebHeaders } from "@plainworks/std/web"
import { decodeRpcFailure, type RpcFailureDecoder } from "./rpc-details"

const CODES: Record<Code, FailureCode> = {
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
  /** Response headers and trailers attached to the error (Connect's `metadata`). */
  readonly headers?: WebHeaders
  /** Underlying cause — typically the originating `ConnectError` — preserved so nothing is swallowed. */
  readonly cause?: unknown
  /** Reads the details into the shared failure. Defaults to {@link decodeRpcFailure}. */
  readonly decode?: RpcFailureDecoder
}

/**
 * Shared remote failure with independently preserved Connect protocol identity. `rpcCode` is the
 * status on the wire; `code` is what the decoder concluded. Malformed known details become
 * operational failures, never form violations.
 */
export class RpcError extends RemoteFailure<`connect/${FailureCode}`> {
  override readonly name: string = "RpcError"
  override readonly fieldPathFormat = "protobuf"
  readonly rpcCode: FailureCode
  /** Original numeric Connect code, preserved for interop. */
  readonly rawCode: Code
  /** Original server details, retained alongside the decoded shared fields. */
  readonly details: Readonly<ConnectError["details"]>
  /** Response headers and trailers attached to the error (Connect's `metadata`). */
  readonly headers: WebHeaders

  constructor(message: string, init: RpcErrorInit) {
    const code = CODES[init.rawCode] ?? "unknown"
    const decode = init.decode ?? decodeRpcFailure
    let failure: Failure
    let cause = init.cause
    try {
      failure = decode({ code, message, details: init.details ?? [] })
    } catch (error) {
      if (!(error instanceof FailureDecodeError)) throw error
      failure = error
      cause = new FailureDecodeError({ cause: init.cause ?? error })
    }
    super(`connect/${code}`, failure, { cause })
    this.rpcCode = code
    this.rawCode = init.rawCode
    this.details = init.details ?? []
    this.headers = init.headers ?? new Headers()
  }
}

/**
 * Normalize any thrown value into the kit's typed {@link RpcError}. Uses `ConnectError.from`, so a
 * plain network failure, an abort, and a `ConnectError` all map to one stable shape without losing
 * the original cause.
 *
 * The transport and Query adapters call it outside interceptor normalization. Consumers already
 * receive RpcError; custom transport integrations may use this boundary explicitly. `decode`
 * defaults to {@link decodeRpcFailure}.
 */
export function mapConnectError(reason: unknown, decode?: RpcFailureDecoder): RpcError {
  if (reason instanceof RpcError) return reason
  const connectError = ConnectError.from(reason)
  return new RpcError(connectError.rawMessage, {
    rawCode: connectError.code,
    details: connectError.details,
    headers: connectError.metadata,
    cause: connectError,
    ...(decode === undefined ? {} : { decode }),
  })
}

/** Narrow an unknown value to {@link RpcError}. */
export function isRpcError(value: unknown): value is RpcError {
  return value instanceof RpcError
}
