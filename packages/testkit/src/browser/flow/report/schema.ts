import type { AllowedFinding, Finding } from "../../checks/findings"
import type { FlowErrorKind } from "../errors"
import type { FlowMode, PreferenceId } from "../matrix/axes"
import type { DeviceId } from "../matrix/devices"

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

/** `report.json`: everything one run checked and captured. */
export interface FlowReport {
  readonly schemaVersion: typeof FLOW_REPORT_SCHEMA_VERSION
  readonly runId: string
  readonly createdAt: string
  readonly summary: FlowReportSummary
  readonly runs: readonly FlowDeviceReport[]
}
