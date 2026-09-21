import type { Json } from "../privacy"
import type { Severity } from "./severity"

/**
 * An opaque handle a source understands to resolve the full detail of an event on demand. The panel
 * treats it as a token: it never inspects the string, only echoes it back in a detail request. Kept
 * a string so it is trivially serializable across any bridge.
 */
export type DetailRef = string

/**
 * A minimal, already-sanitized summary of something that happened in a source. Events are the
 * high-frequency path, so they stay small: a label, a severity, a timestamp, and a few whitelisted
 * summary fields. Anything expensive is left behind `detail` and fetched only when the item is
 * selected.
 */
export interface SourceEvent {
  /** Event kind within the source (`"request"`, `"reconnect"`), for filtering. */
  readonly kind: string
  /** Human, single-line label for the timeline row. */
  readonly label: string
  /** Severity for color, sort, and filter. */
  readonly severity: Severity
  /** Clock time the event occurred. */
  readonly at: number
  /** Small, whitelisted, sanitized fields shown inline without a detail fetch. */
  readonly summary?: Json
  /** Token to fetch the full, expensive detail on demand; absent when there is nothing more. */
  readonly detail?: DetailRef
}
