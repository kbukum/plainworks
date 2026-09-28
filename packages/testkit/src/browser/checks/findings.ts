/**
 * Every check a flow runs at a checkpoint. The first group is the baseline-free spine the gate has
 * always run; the layout heuristics turn visual defects axe cannot see into findings; `pixel` is
 * the opt-in comparison against a committed baseline.
 */
export const CHECK_IDS = [
  "runtime",
  "hydration",
  "axe",
  "reflow",
  "overlay",
  "focus",
  "clipped-text",
  "overlapping-targets",
  "obscured-focusable",
  "broken-image",
  "layout-shift",
  "pixel",
] as const

/** One check of {@link CHECK_IDS}. */
export type CheckId = (typeof CHECK_IDS)[number]

/** One problem a check found, as one actionable line. */
export interface Finding {
  readonly check: CheckId
  readonly message: string
}

/**
 * Accept findings a checkpoint provokes on purpose. It names the check, optionally narrows it to
 * messages matching `match`, and always says why, so a reviewer can judge the exception.
 */
export interface Allowance {
  readonly check: CheckId
  readonly match?: RegExp
  readonly reason: string
}

/** A finding an {@link Allowance} accepted, kept in the report with the allowance's reason. */
export interface AllowedFinding extends Finding {
  readonly reason: string
}

/** Findings split into the failures that stand and the ones an allowance accepted. */
export interface JudgedFindings {
  readonly failures: readonly Finding[]
  readonly allowed: readonly AllowedFinding[]
}

/** Split `findings` by `allowances`. An allowance only ever matches findings of its own check. */
export function applyAllowances(
  findings: readonly Finding[],
  allowances: readonly Allowance[],
): JudgedFindings {
  const failures: Finding[] = []
  const allowed: AllowedFinding[] = []
  for (const finding of findings) {
    const allowance = allowances.find(
      (candidate) =>
        candidate.check === finding.check &&
        (candidate.match === undefined || candidate.match.test(finding.message)),
    )
    if (allowance === undefined) failures.push(finding)
    else allowed.push({ ...finding, reason: allowance.reason })
  }
  return { failures, allowed }
}

// Enough messages to act on, few enough that one broken grid cannot flood a report.
const MAX_FINDINGS_PER_CHECK = 10

/**
 * Keep the first `limit` findings of each check and replace the rest with one `…and N more` line
 * per check, in the original order. Cap after {@link applyAllowances}, so an allowance always
 * judges every real finding and never the summary line.
 */
export function capFindingsPerCheck<T extends Finding>(
  findings: readonly T[],
  limit: number = MAX_FINDINGS_PER_CHECK,
): Finding[] {
  const counts = new Map<CheckId, number>()
  const kept: Finding[] = []
  for (const finding of findings) {
    const count = (counts.get(finding.check) ?? 0) + 1
    counts.set(finding.check, count)
    if (count <= limit) kept.push(finding)
  }
  for (const [check, count] of counts) {
    if (count > limit) kept.push({ check, message: `…and ${count - limit} more ${check} findings` })
  }
  return kept
}
