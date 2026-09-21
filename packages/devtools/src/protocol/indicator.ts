import type { Severity } from "./severity"

/**
 * A compact, glanceable signal for the diagnostics rail — one number or word with a severity and a
 * place to jump. Every rail indicator is derived from a registered source, so the rail is a *view*
 * of the same session data, never a second telemetry channel.
 */
export interface StatusIndicator {
  /** Stable identity within its source, so an update replaces the prior value in place. */
  readonly id: string
  /** Accessible, human label (`"Cache"`, `"Channel"`). Screen readers announce this. */
  readonly label: string
  /** Concise current value (`"3 stale"`, `"connected"`). Kept short for the rail. */
  readonly value: string
  /** How urgent the value is, driving color and sort order. */
  readonly severity: Severity
  /** Clock time the value was produced, so the client can show and fade staleness. */
  readonly updatedAt: number
  /** Inspector view this indicator opens when activated (a panel or timeline filter id). */
  readonly target?: string
}
