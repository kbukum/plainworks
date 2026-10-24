import type { AllowedFinding, Finding } from "../../checks/findings"
import { type BudgetVerdict, isBudgetFailure } from "../journey/budget"
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
 * run compared with a base), then one row per flow and device, then what each journey cost its user
 * against its budget, then every failure with links to its evidence, then every allowed finding
 * with its reason. Links are relative to the run directory, where the file is written.
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

  lines.push(...journeyLines(report.runs))

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
        : selection.by === "docs"
          ? "The flows that mark docs images"
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
  const lines = ["", review === undefined ? "## Frames" : "## Visual changes", ""]
  if (review === undefined)
    lines.push("Not compared with a base; pass `--base` to see what changed.")
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

// One row per flow and device whose user did anything or whose flow has a budget. A limit reads
// `views 3/1`, marked when it is over, a known overrun, or a known overrun that no longer happens.
function journeyLines(runs: readonly FlowDeviceReport[]): string[] {
  const measured = runs.filter(
    (run) =>
      run.journey !== undefined &&
      (run.journey.budget.length > 0 || Object.values(run.journey.metrics).some((n) => n > 0)),
  )
  if (measured.length === 0) return []
  return [
    "",
    "## Journeys",
    "",
    "| Flow | Device | Views | Typed | Picks | Activations | Focus moves | Budget |",
    "|---|---|---|---|---|---|---|---|",
    ...measured.map((run) => {
      const journey = run.journey
      if (journey === undefined) return ""
      const { metrics } = journey
      const budget =
        journey.budget.map(describeVerdict).join("; ") ||
        (run.status === "error" ? "not judged" : "—")
      return `| ${run.flow} | ${run.device} | ${metrics.views} | ${metrics.typedFields} | ${metrics.picks} | ${metrics.activations} | ${metrics.focusMoves} | ${budget} |`
    }),
  ]
}

function describeVerdict(verdict: BudgetVerdict): string {
  const used = `${verdict.metric} ${verdict.actual}/${verdict.max}`
  const until = verdict.failsUntil === undefined ? "" : ` until ${oneLine(verdict.failsUntil.step)}`
  switch (verdict.status) {
    case "met":
      return used
    case "over":
      return `**${used} over**`
    case "expected-over":
      return `${used} expected${until}: ${oneLine(verdict.failsUntil?.reason ?? "")}`
    case "unexpectedly-met":
      return `**${used} met: remove failsUntil${until}**`
  }
}

const countVariants = (run: FlowDeviceReport): number =>
  run.checkpoints.reduce((total, checkpoint) => total + checkpoint.variants.length, 0)

const countFailures = (run: FlowDeviceReport): number =>
  run.checkpoints.reduce(
    (total, checkpoint) =>
      total +
      checkpoint.findings.length +
      checkpoint.variants.reduce((sum, variant) => sum + variant.findings.length, 0),
    run.journey?.budget.filter(isBudgetFailure).length ?? 0,
  )
