import type { AllowedFinding, Finding } from "../../checks/findings"
import type { FlowErrorKind } from "../errors"
import type { FlowMode, PreferenceId } from "../matrix/axes"
import type { DeviceId } from "../matrix/devices"
import type { MatrixPresetName } from "../matrix/presets"

/**
 * The report schema version. It changes whenever a field changes meaning or goes away, so a tool
 * reading `report.json` can refuse a report it does not understand.
 */
export const FLOW_REPORT_SCHEMA_VERSION = 1

/** How a flow ran: `assert` only checks; `capture` also writes frames and ARIA snapshots. */
export type FlowRunMode = "assert" | "capture"

/** Whether an entry passed, failed a check, could not finish, or never ran. */
export type FlowStatus = "pass" | "fail" | "error" | "skipped"

/** A harness failure as the report records it. */
export interface ReportedError {
  readonly kind: FlowErrorKind
  readonly message: string
}

/**
 * The evidence written for a failure, as paths relative to the run directory. None of it holds
 * cookies, tokens, or storage state: the DOM snapshot drops scripts and hidden and password field
 * values, and the network log keeps only method, status, and the URL without its query.
 */
export interface EvidenceLinks {
  readonly dom: string
  readonly aria: string
  readonly console: string
  readonly network: string
  readonly frame?: string
}

/** One page variant at one checkpoint. */
export interface VariantReport {
  readonly id: string
  readonly mode: FlowMode
  readonly theme: string
  readonly density: string
  readonly preference: PreferenceId
  readonly status: FlowStatus
  readonly findings: readonly Finding[]
  readonly allowed: readonly AllowedFinding[]
  /** The captured frame, in `capture` mode. */
  readonly frame?: string
  /** The ARIA snapshot, in `capture` mode. */
  readonly aria?: string
  readonly evidence?: EvidenceLinks
}

/** One checkpoint on one device. Runtime and hydration findings belong to the checkpoint. */
export interface CheckpointReport {
  readonly index: number
  readonly name: string
  readonly status: FlowStatus
  readonly findings: readonly Finding[]
  readonly allowed: readonly AllowedFinding[]
  readonly error?: ReportedError
  readonly evidence?: EvidenceLinks
  readonly variants: readonly VariantReport[]
}

/** One flow replayed on one device. */
export interface FlowDeviceReport {
  readonly flow: string
  readonly device: DeviceId
  readonly mode: FlowRunMode
  readonly status: FlowStatus
  readonly error?: ReportedError
  /** Where the runner keeps this test's trace, when tracing is on. It holds cookies: never share it. */
  readonly trace?: string
  readonly checkpoints: readonly CheckpointReport[]
}

/** Totals over a whole run. `verdict` is `fail` when any entry failed a check or errored. */
export interface FlowReportSummary {
  readonly verdict: "pass" | "fail"
  readonly flows: number
  readonly runs: number
  readonly checkpoints: number
  readonly variants: number
  readonly frames: number
  readonly failures: number
  readonly allowed: number
  readonly errors: number
}

/** One flow a run picked, and why. */
export interface SelectedFlow {
  readonly name: string
  /** Each reason on its own line: the flow was named, covers a changed file, or ran to fail safe. */
  readonly reasons: readonly string[]
}

/** Which flows a run picked, over which matrix preset. */
export interface FlowSelection {
  /** `all` flows, the flows `named` on the command line, or the flows `affected` by a change. */
  readonly by: "all" | "named" | "affected"
  readonly preset: MatrixPresetName
  /** For `affected`: the commit changed files were counted from. */
  readonly since?: string
  /** For `affected`: how many files changed since then. */
  readonly changedFiles?: number
  /**
   * For `affected`: changed files that no flow covers. Any of them runs every flow, so a change
   * the flows do not map never skips the check.
   */
  readonly unmapped?: readonly string[]
  readonly flows: readonly SelectedFlow[]
}

/**
 * How a frame compares with the same frame in the base run. A base frame is `removed` only when
 * its flow ran cleanly on that device and no longer reaches it; when that run errored or was not
 * selected, the frame is `not-captured`, which says nothing about the change.
 */
export type ChangeStatus = "unchanged" | "changed" | "added" | "removed" | "not-captured"

/** How many frames of a change review fall in each {@link ChangeStatus}. */
export type ChangeTotals = { readonly [status in ChangeStatus]: number }

/** One page variant at one checkpoint that differs from the base run. */
export interface FrameChange {
  readonly flow: string
  readonly device: DeviceId
  readonly index: number
  readonly checkpoint: string
  readonly variant: string
  readonly status: Exclude<ChangeStatus, "unchanged" | "not-captured">
  /** For a `changed` frame: how many pixels differ, and whether the frame size changed. */
  readonly pixels?: {
    readonly different: number
    readonly total: number
    readonly sizeChanged: boolean
  }
  /** For a `changed` frame: whether its ARIA snapshot differs too. */
  readonly ariaChanged?: boolean
  /** The base frame, copied into this run. */
  readonly before?: string
  /** This run's frame. */
  readonly after?: string
  /** The changed pixels highlighted over the frame. */
  readonly diff?: string
  /** The ARIA snapshot as a line diff. */
  readonly ariaDiff?: string
}

/** Where a change review's base run came from. */
export interface ReviewBase {
  /** A named local `snapshot`, or a capture at a `git` commit. */
  readonly kind: "snapshot" | "git"
  /** The snapshot name, or the ref the commit was resolved from. */
  readonly name: string
  readonly commit?: string
  readonly runId: string
}

/**
 * The before/after of a run against a base run on the same machine. Visual changes are reported,
 * never failed: the verdict stays with the checks.
 */
export type ChangeReview =
  | {
      readonly status: "compared"
      readonly base: ReviewBase
      readonly totals: ChangeTotals
      /** Every frame that is `changed`, `added`, or `removed`. */
      readonly changes: readonly FrameChange[]
    }
  | { readonly status: "skipped"; readonly reason: string }

/** The contact sheets a capture run renders, as paths relative to the run directory. */
export interface ContactSheets {
  /** One labeled grid of every variant per checkpoint and device. */
  readonly checkpoints: readonly string[]
  /** Only the changed frames, each as before, after, and diff. */
  readonly changed?: string
}

/** `report.json`: everything one run checked and captured. */
export interface FlowReport {
  readonly schemaVersion: typeof FLOW_REPORT_SCHEMA_VERSION
  readonly runId: string
  readonly createdAt: string
  readonly summary: FlowReportSummary
  readonly selection?: FlowSelection
  readonly review?: ChangeReview
  readonly sheets?: ContactSheets
  readonly runs: readonly FlowDeviceReport[]
}
