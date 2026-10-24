/**
 * What a journey costs its user, counted while a flow drives the page through its `FlowUser`.
 *
 * - `views` — distinct pages shown: each change of the URL path, the first page included. A query
 *   or hash change on the same path is the same view.
 * - `typedFields` — values typed into fields.
 * - `picks` — choices made from a list of options: a select, combobox, listbox, or radio group.
 * - `activations` — buttons, links, checkboxes, and other controls activated.
 * - `focusMoves` — Tab presses spent reaching controls by keyboard. Reported, never budgeted: it
 *   depends on the page's chrome as much as on the journey.
 */
export interface JourneyMetrics {
  readonly views: number
  readonly typedFields: number
  readonly picks: number
  readonly activations: number
  readonly focusMoves: number
}

/** The metrics a {@link JourneyBudget} may limit, in the order the report lists them. */
export const BUDGET_METRICS = ["views", "typedFields", "picks", "activations"] as const

/** One metric of {@link BUDGET_METRICS}. */
export type BudgetMetric = (typeof BUDGET_METRICS)[number]

/**
 * A known overrun: the journey is over this limit today, and the change named by `step` is what
 * brings it in. The flow still passes, and the report lists it; once the journey meets the limit,
 * the flow fails until the marker is removed, so an expectation never outlives its reason.
 */
export interface ExpectedOverrun {
  /** The change that will meet the limit, such as a plan step or an issue. */
  readonly step: string
  readonly reason: string
}

/** The most a journey may spend of one metric. */
export interface BudgetLimit {
  readonly max: number
  readonly failsUntil?: ExpectedOverrun
}

/** The limits a journey must stay within. A metric left out is reported, not judged. */
export type JourneyBudget = { readonly [Metric in BudgetMetric]?: BudgetLimit }

/**
 * How one limit was judged: `met`, `over` (fails), `expected-over` (a known overrun, passes), or
 * `unexpectedly-met` (a known overrun that no longer happens, fails).
 */
export type BudgetStatus = "met" | "over" | "expected-over" | "unexpectedly-met"

/** One limit's verdict. */
export interface BudgetVerdict {
  readonly metric: BudgetMetric
  readonly max: number
  readonly actual: number
  readonly status: BudgetStatus
  readonly failsUntil?: ExpectedOverrun
}

/** Judge a completed journey's metrics against its budget, one verdict per limit. */
export function judgeJourneyBudget(
  budget: JourneyBudget,
  metrics: JourneyMetrics,
): BudgetVerdict[] {
  return BUDGET_METRICS.flatMap((metric): BudgetVerdict[] => {
    const limit = budget[metric]
    if (limit === undefined) return []
    const actual = metrics[metric]
    const over = actual > limit.max
    const { failsUntil } = limit
    if (failsUntil === undefined) {
      return [{ metric, max: limit.max, actual, status: over ? "over" : "met" }]
    }
    return [
      {
        metric,
        max: limit.max,
        actual,
        status: over ? "expected-over" : "unexpectedly-met",
        failsUntil,
      },
    ]
  })
}

/** Whether a verdict fails its flow. */
export const isBudgetFailure = (verdict: BudgetVerdict): boolean =>
  verdict.status === "over" || verdict.status === "unexpectedly-met"
