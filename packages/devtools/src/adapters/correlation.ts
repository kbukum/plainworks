import type { WebAbortSignal } from "@plainworks/std"
import type { Severity } from "../protocol"

/**
 * The shared outcome vocabulary every request-shaped flow settles into, so the unified timeline can
 * explain an HTTP attempt and a Connect call the same way without forcing either package into one
 * transport abstraction:
 *
 * - `ok` — the exchange completed successfully.
 * - `error` — it failed with a server/transport/protocol error.
 * - `timeout` — it exceeded its deadline.
 * - `canceled` — the caller aborted it.
 */
export type ExchangeOutcome = "ok" | "error" | "timeout" | "canceled"

/**
 * Whether a settled attempt's abort was a per-attempt **timeout** rather than a caller
 * cancellation. The resilience layer aborts the attempt signal with a std `TimeoutError` reason
 * when its deadline fires, and that reason reaches this inner interceptor before the outer layer
 * remaps the thrown value to a typed timeout — so the abort reason is the reliable discriminator.
 * The thrown value alone is ambiguous: a local deadline surfaces as a bare abort or a
 * `ConnectError(Canceled)`, indistinguishable from a real caller cancel.
 */
export function isDeadlineAbort(signal: WebAbortSignal | undefined): boolean {
  return (
    signal?.aborted === true &&
    signal.reason instanceof Error &&
    signal.reason.name === "TimeoutError"
  )
}

/** A monotonic id generator that tags one request-shaped exchange each, for start/settle pairing. */
export interface Correlator {
  /** The next unique correlation id, prefixed for readability in the timeline. */
  next(): string
}

/**
 * Create a {@link Correlator}. Ids are per-adapter and never reused, so a start event and its
 * settle event share one id even when many exchanges overlap concurrently.
 */
export function createCorrelator(prefix: string): Correlator {
  let counter = 0
  return {
    next() {
      counter += 1
      return `${prefix}-${counter}`
    },
  }
}

/** The timeline {@link Severity} for a settled exchange: success is `ok`, a failure `error`, an
 * expected-but-abnormal end (`timeout`/`canceled`) a `warn`. */
export function outcomeSeverity(outcome: ExchangeOutcome): Severity {
  switch (outcome) {
    case "ok":
      return "ok"
    case "error":
      return "error"
    default:
      return "warn"
  }
}

/** Running totals for a request-shaped source's aggregate status indicator. */
export interface ExchangeCounts {
  total: number
  failing: number
  inFlight: number
}

/**
 * One-line indicator text shared by every request-shaped adapter, so an HTTP client and a Connect
 * transport read identically: a total, then failing and in-flight counts only when non-zero. `unit`
 * is the singular exchange noun (`"request"`, `"call"`), pluralized with a trailing `s`.
 */
export function describeExchangeCounts(counts: ExchangeCounts, unit: string): string {
  const parts = [`${counts.total} ${unit}${counts.total === 1 ? "" : "s"}`]
  if (counts.failing > 0) parts.push(`${counts.failing} failing`)
  if (counts.inFlight > 0) parts.push(`${counts.inFlight} in flight`)
  return parts.join(" · ")
}
