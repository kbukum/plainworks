import type { AllowedFinding, Finding } from "../../checks/findings"
import type {
  ChangeReview,
  ChangeTotals,
  CheckpointReport,
  ContactSheets,
  EvidenceLinks,
  FlowDeviceReport,
  FlowReport,
  FlowSelection,
  FrameChange,
} from "./schema"

/**
 * Render `report.md`: the verdict first, then why each flow ran and what changed visually (when the
 * run was a `ui:check`), then one row per flow and device, then every failure with links to its
 * evidence, then every allowed finding with its reason. Links are relative to the run directory,
 * where the file is written.
 */
export function renderFlowReportMarkdown(report: FlowReport): string {
  const { summary } = report
  const lines = [
    "# UI flow report",
    "",
    `**Verdict: ${summary.verdict}** — ${summary.failures} failures and ${summary.errors} errors across ${summary.runs} runs of ${summary.flows} flows. ${summary.checkpoints} checkpoints, ${summary.variants} variants, ${summary.frames} frames.`,
    "",
    `Run \`${report.runId}\`, schema v${report.schemaVersion}.`,
    ...selectionLines(report.selection),
    ...reviewLines(report.review, report.sheets),
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

function selectionLines(selection: FlowSelection | undefined): string[] {
  if (selection === undefined) return []
  const scope =
    selection.by === "affected"
      ? `Affected by ${selection.changedFiles ?? 0} changed files since \`${selection.since ?? "?"}\``
      : selection.by === "named"
        ? "Named on the command line"
        : "Every flow"
  return [
    "",
    "## Selection",
    "",
    `${scope}, preset \`${selection.preset}\`.`,
    "",
    ...selection.flows.map(
      (flow) => `- **${flow.name}** — ${flow.reasons.map(oneLine).join("; ")}`,
    ),
  ]
}

function reviewLines(
  review: ChangeReview | undefined,
  sheets: ContactSheets | undefined,
): string[] {
  if (review === undefined && sheets === undefined) return []
  const lines = ["", "## Visual changes", ""]
  if (review === undefined) lines.push("Not reviewed.")
  else if (review.status === "skipped") lines.push(`Not reviewed: ${oneLine(review.reason)}`)
  else {
    const { base, totals } = review
    const commit = base.commit === undefined ? "" : ` (\`${base.commit}\`)`
    lines.push(`Against ${base.kind} \`${base.name}\`${commit}: ${describeChangeTotals(totals)}.`)
    if (review.changes.length > 0) lines.push("", ...review.changes.map(describeChange))
  }
  if (sheets !== undefined && (sheets.checkpoints.length > 0 || sheets.changed !== undefined)) {
    const entries = [
      ...(sheets.changed === undefined ? [] : [`[changed only](${sheets.changed})`]),
      ...sheets.checkpoints.map((sheet, index) => `[${step(index)}](${sheet})`),
    ]
    lines.push("", `Contact sheets: ${entries.join(" · ")}`)
  }
  return lines
}

/**
 * The change counts as one clause, such as `1 changed, 0 added, 0 removed, 3 unchanged`. Frames
 * the run could not capture are named only when there are some.
 */
export function describeChangeTotals(totals: ChangeTotals): string {
  const counts = `${totals.changed} changed, ${totals.added} added, ${totals.removed} removed, ${totals.unchanged} unchanged`
  const missing = totals["not-captured"]
  return missing === 0
    ? counts
    : `${counts}, ${missing} not captured (their flow errored or did not run)`
}

function describeChange(change: FrameChange): string {
  const at = `${change.flow} › ${change.device} › ${step(change.index)} ${change.checkpoint} › ${change.variant}`
  const facts = [
    ...(change.pixels === undefined
      ? []
      : [change.pixels.sizeChanged ? "size changed" : `${change.pixels.different} px`]),
    ...(change.ariaChanged === true ? ["ARIA changed"] : []),
  ]
  const files: readonly (readonly [string, string | undefined])[] = [
    ["before", change.before],
    ["after", change.after],
    ["diff", change.diff],
    ["ARIA diff", change.ariaDiff],
  ]
  const links = files.flatMap(([label, path]) =>
    path === undefined ? [] : [`[${label}](${path})`],
  )
  const parts = [...(facts.length > 0 ? [facts.join(", ")] : []), links.join(" · ")]
  return `- ${change.status} \`${at}\` — ${parts.join(" — ")}`
}

const step = (index: number): string => String(index + 1).padStart(2, "0")

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
