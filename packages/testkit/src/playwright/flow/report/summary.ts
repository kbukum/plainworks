import type { FlowDeviceReport, FlowReportSummary } from "./schema"

/** Total a run's entries into its {@link FlowReportSummary}. */
export function summarizeFlowRuns(runs: readonly FlowDeviceReport[]): FlowReportSummary {
  const checkpoints = runs.flatMap((run) => run.checkpoints)
  const variants = checkpoints.flatMap((checkpoint) => checkpoint.variants)
  const failures =
    checkpoints.reduce((total, checkpoint) => total + checkpoint.findings.length, 0) +
    variants.reduce((total, variant) => total + variant.findings.length, 0)
  const allowed =
    checkpoints.reduce((total, checkpoint) => total + checkpoint.allowed.length, 0) +
    variants.reduce((total, variant) => total + variant.allowed.length, 0)
  const errors = runs.filter((run) => run.status === "error").length
  return {
    verdict:
      failures > 0 || errors > 0 || runs.some((run) => run.status === "fail") ? "fail" : "pass",
    flows: new Set(runs.map((run) => run.flow)).size,
    runs: runs.length,
    checkpoints: checkpoints.length,
    variants: variants.length,
    frames: variants.filter((variant) => variant.frame !== undefined).length,
    failures,
    allowed,
    errors,
  }
}
