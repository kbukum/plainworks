import { assertTimerMs, getErrorMessage } from "@plainworks/std"
import { ChannelError } from "./error"

/**
 * Reject a timing option a host timer would silently coerce (NaN/negative/overflow), as a typed
 * config error. The ceiling and check live in `std` (`assertTimerMs`); this only re-labels the
 * failure for the package's error family. Internal — not exported from the package entry.
 */
export function assertDurationMs(label: string, ms: number): void {
  try {
    assertTimerMs(ms)
  } catch (cause) {
    throw ChannelError.config(`${label}: ${getErrorMessage(cause)}`, { cause })
  }
}
