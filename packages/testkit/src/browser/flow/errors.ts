import { PlainError } from "@plainworks/std"

/**
 * Why a flow could not finish, as a stable discriminant.
 *
 * - `definition` — the flow, its matrix, or an allowance is malformed (a programmer fault).
 * - `action` — a checkpoint's action threw.
 * - `readiness` — a checkpoint's declared ready condition never held.
 * - `unstable-frame` — the page never painted the same frame twice in a row.
 * - `timeout` — a step ran past its time budget.
 * - `session` — the browser session failed: the page closed or crashed, or a measurement threw.
 * - `aborted` — the caller cancelled the run.
 * - `failed` — the flow ran to the end, but a check reported a failure.
 * - `report` — a stored report or run entry is malformed or from another schema version.
 */
export const FLOW_ERROR_KINDS = [
  "definition",
  "action",
  "readiness",
  "unstable-frame",
  "timeout",
  "session",
  "aborted",
  "failed",
  "report",
] as const

/** One kind of {@link FLOW_ERROR_KINDS}. */
export type FlowErrorKind = (typeof FLOW_ERROR_KINDS)[number]

/** A typed flow failure that keeps its underlying cause. */
export class FlowError extends PlainError<`flow/${FlowErrorKind}`> {
  /** The same kind without the `flow/` prefix, as the report records it. */
  readonly reason: FlowErrorKind

  constructor(reason: FlowErrorKind, message: string, options?: { cause?: unknown }) {
    super(`flow/${reason}`, message, options)
    this.reason = reason
  }
}
