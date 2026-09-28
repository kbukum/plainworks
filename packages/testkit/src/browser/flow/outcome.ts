import { FlowError } from "./errors"
import type { FlowDeviceReport } from "./report/schema"

// Enough lines to act on in a test failure; the report holds the rest.
const MAX_LISTED_FAILURES = 20

/**
 * The error a flow's test fails with, or `undefined` when it passed. A harness error keeps its
 * kind; failed checks become one `flow/failed` error listing each finding by checkpoint and
 * variant.
 */
export function flowOutcomeError(report: FlowDeviceReport): FlowError | undefined {
  const title = `${report.flow} › ${report.device}`
  if (report.error !== undefined) {
    return new FlowError(report.error.kind, `${title}: ${report.error.message}`)
  }
  if (report.status !== "fail") return undefined
  const lines = report.checkpoints.flatMap((checkpoint) => [
    ...checkpoint.findings.map(
      (finding) => `${checkpoint.name} › ${finding.check}: ${finding.message}`,
    ),
    ...checkpoint.variants.flatMap((variant) =>
      variant.findings.map(
        (finding) => `${checkpoint.name} › ${variant.id} › ${finding.check}: ${finding.message}`,
      ),
    ),
  ])
  const listed = lines.slice(0, MAX_LISTED_FAILURES).map((line) => `  ${line}`)
  const rest = lines.length - listed.length
  return new FlowError(
    "failed",
    [
      `${title} failed ${lines.length} check(s):`,
      ...listed,
      ...(rest > 0 ? [`  …and ${rest} more`] : []),
    ].join("\n"),
  )
}
