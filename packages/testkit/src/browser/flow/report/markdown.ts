import type { AllowedFinding, Finding } from "../../checks/findings"
import type { CheckpointReport, EvidenceLinks, FlowDeviceReport, FlowReport } from "./schema"

/**
 * Render `report.md`: the verdict first, then one row per flow and device, then every failure with
 * links to its evidence, then every allowed finding with its reason. Links are relative to the run
 * directory, where the file is written.
 */
export function renderFlowReportMarkdown(report: FlowReport): string {
  const { summary } = report
  const lines = [
    "# UI flow report",
    "",
    `**Verdict: ${summary.verdict}** — ${summary.failures} failures and ${summary.errors} errors across ${summary.runs} runs of ${summary.flows} flows. ${summary.checkpoints} checkpoints, ${summary.variants} variants, ${summary.frames} frames.`,
    "",
    `Run \`${report.runId}\`, schema v${report.schemaVersion}.`,
    "",
    "| Flow | Device | Status | Checkpoints | Variants | Failures |",
    "|---|---|---|---|---|---|",
    ...report.runs.map(
      (run) =>
        `| ${run.flow} | ${run.device} | ${run.status} | ${run.checkpoints.length} | ${countVariants(run)} | ${countFailures(run)} |`,
    ),
  ]

  const failing = report.runs.flatMap((run) =>
    run.checkpoints
      .filter((checkpoint) => checkpoint.status === "fail" || checkpoint.status === "error")
      .map((checkpoint) => ({ run, checkpoint })),
  )
  if (failing.length > 0) {
    lines.push("", "## Failures")
    for (const { run, checkpoint } of failing) {
      lines.push("", `### ${where(run, checkpoint)}`, "")
      if (checkpoint.error !== undefined) {
        lines.push(
          `- **${checkpoint.error.kind}:** ${oneLine(checkpoint.error.message)}${links(checkpoint.evidence)}`,
        )
      }
      for (const finding of checkpoint.findings)
        lines.push(`- ${describe(finding)}${links(checkpoint.evidence)}`)
      for (const variant of checkpoint.variants) {
        for (const finding of variant.findings) {
          lines.push(`- \`${variant.id}\` ${describe(finding)}${links(variant.evidence)}`)
        }
      }
    }
  }

  const allowed = report.runs.flatMap((run) =>
    run.checkpoints.flatMap((checkpoint) =>
      [...checkpoint.allowed, ...checkpoint.variants.flatMap((variant) => variant.allowed)].map(
        (finding) => ({ run, checkpoint, finding }),
      ),
    ),
  )
  if (allowed.length > 0) {
    lines.push("", "## Allowed", "")
    for (const { run, checkpoint, finding } of allowed) {
      lines.push(
        `- ${where(run, checkpoint)} — ${describe(finding)} _(allowed: ${oneLine(finding.reason)})_`,
      )
    }
  }
  return `${lines.join("\n")}\n`
}

const where = (run: FlowDeviceReport, checkpoint: CheckpointReport): string =>
  `${run.flow} › ${run.device} › ${String(checkpoint.index + 1).padStart(2, "0")} ${checkpoint.name}`

const describe = (finding: Finding | AllowedFinding): string =>
  `**${finding.check}:** ${oneLine(finding.message)}`

const oneLine = (text: string): string =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" ")

function links(evidence: EvidenceLinks | undefined): string {
  if (evidence === undefined) return ""
  const entries: [string, string | undefined][] = [
    ["frame", evidence.frame],
    ["DOM", evidence.dom],
    ["ARIA", evidence.aria],
    ["console", evidence.console],
    ["network", evidence.network],
  ]
  return ` — ${entries
    .flatMap(([label, path]) => (path === undefined ? [] : [`[${label}](${path})`]))
    .join(" · ")}`
}

const countVariants = (run: FlowDeviceReport): number =>
  run.checkpoints.reduce((total, checkpoint) => total + checkpoint.variants.length, 0)

const countFailures = (run: FlowDeviceReport): number =>
  run.checkpoints.reduce(
    (total, checkpoint) =>
      total +
      checkpoint.findings.length +
      checkpoint.variants.reduce((sum, variant) => sum + variant.findings.length, 0),
    0,
  )
