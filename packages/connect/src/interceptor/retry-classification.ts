import { ConnectError } from "@connectrpc/connect"
import { isRetryable } from "@plainworks/std/resilience"
import { mapConnectError } from "../errors"

/**
 * Whether a failure is worth retrying, layered on the shared `std` classifier so connect uses
 * **one** retry taxonomy instead of forking its own. A `ConnectError` is decoded into the shared
 * failure and explicit retry verdict; anything else (a per-attempt `std` `TimeoutError` →
 * retryable, a caller `AbortError` → fatal, an unknown throw → fatal) defers to `std`'s
 * `isRetryable`.
 */
export function isConnectRetryable(error: unknown): boolean {
  if (error instanceof ConnectError) {
    return isRetryable(mapConnectError(error))
  }

  return isRetryable(error)
}

/** Standard RetryInfo minimum in milliseconds, after explicit verdict precedence. */
export function connectRetryAfter(error: unknown): number | undefined {
  return error instanceof ConnectError ? mapConnectError(error).retryAfterMs : undefined
}
