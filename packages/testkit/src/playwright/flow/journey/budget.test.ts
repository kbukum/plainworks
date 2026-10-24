import { describe, expect, it } from "vitest"
import { isBudgetFailure, type JourneyMetrics, judgeJourneyBudget } from "./budget"

const metrics: JourneyMetrics = {
  views: 3,
  typedFields: 2,
  picks: 1,
  activations: 4,
  focusMoves: 17,
}

describe("judgeJourneyBudget", () => {
  it("meets a limit the journey stays within, and fails one it exceeds", () => {
    expect(judgeJourneyBudget({ views: { max: 3 }, typedFields: { max: 1 } }, metrics)).toEqual([
      { metric: "views", max: 3, actual: 3, status: "met" },
      { metric: "typedFields", max: 1, actual: 2, status: "over" },
    ])
  })

  it("keeps an expected overrun visible without failing it", () => {
    const failsUntil = { step: "07", reason: "fields collapse into one evaluate page" }
    expect(judgeJourneyBudget({ views: { max: 1, failsUntil } }, metrics)).toEqual([
      { metric: "views", max: 1, actual: 3, status: "expected-over", failsUntil },
    ])
  })

  it("fails an expected overrun that no longer happens, so the marker is removed", () => {
    const failsUntil = { step: "07", reason: "one page" }
    expect(judgeJourneyBudget({ picks: { max: 1, failsUntil } }, metrics)).toEqual([
      { metric: "picks", max: 1, actual: 1, status: "unexpectedly-met", failsUntil },
    ])
  })

  it("judges limits in a stable metric order, whatever order the budget lists them", () => {
    const verdicts = judgeJourneyBudget(
      { activations: { max: 9 }, views: { max: 9 }, picks: { max: 9 } },
      metrics,
    )
    expect(verdicts.map((verdict) => verdict.metric)).toEqual(["views", "picks", "activations"])
  })

  it("names which verdicts fail the flow", () => {
    expect(
      judgeJourneyBudget(
        {
          views: { max: 1 },
          picks: { max: 5, failsUntil: { step: "07", reason: "r" } },
          typedFields: { max: 9 },
        },
        metrics,
      )
        .filter(isBudgetFailure)
        .map((verdict) => verdict.metric),
    ).toEqual(["views", "picks"])
  })
})
