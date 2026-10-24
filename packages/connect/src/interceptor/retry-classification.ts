import { ConnectError } from "@connectrpc/connect"
import { isRetryable } from "@plainworks/std/resilience"
import { mapConnectError, type RpcFailureDecoder } from "../errors"

/**
 * Whether a failure is worth retrying, layered on the shared `std` classifier so connect uses
 * **one** retry taxonomy instead of forking its own. A `ConnectError` is decoded into the shared
 * failure with `decode` (the standard model by default); anything else (a per-attempt `std`
 * `TimeoutError` → retryable, a caller `AbortError` → fatal, an unknown throw → fatal) defers to
 * `std`'s `isRetryable`.
 */
export function isConnectRetryable(error: unknown, decode?: RpcFailureDecoder): boolean {
  if (error instanceof ConnectError) {
    return isRetryable(mapConnectError(error, decode))
  }

  return isRetryable(error)
}

/** The decoded retry delay in milliseconds, before any caller policy. */
export function connectRetryAfter(error: unknown, decode?: RpcFailureDecoder): number | undefined {
  return error instanceof ConnectError ? mapConnectError(error, decode).retryAfterMs : undefined
}
