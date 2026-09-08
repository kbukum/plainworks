import { Code, ConnectError } from "@connectrpc/connect"
import { isRetryable } from "@plainworks/std"

/**
 * Connect codes safe to retry for an idempotent call: `unavailable` (the server told the client to
 * back off and retry — also how connect-web surfaces a failed `fetch`) and `resource_exhausted`
 * (rate-limited). Every other code is a definite outcome that a retry would only repeat.
 */
const RETRYABLE_CODES: ReadonlySet<Code> = new Set([Code.Unavailable, Code.ResourceExhausted])

/**
 * Whether a failure is worth retrying, layered on the shared `std` classifier so connect uses
 * **one** retry taxonomy instead of forking its own. A `ConnectError` is judged by its
 * {@link Code}; anything else (a per-attempt `std` `TimeoutError` → retryable, a caller
 * `AbortError` → fatal, an unknown throw → fatal) defers to `std`'s `isRetryable`.
 */
export function isConnectRetryable(error: unknown): boolean {
  if (error instanceof ConnectError) {
    return RETRYABLE_CODES.has(error.code)
  }
  return isRetryable(error)
}
