import { describe, expect, it } from "vitest"
import { flowOutcomeError } from "./outcome"
import type { FlowDeviceReport } from "./report/schema"

const base: FlowDeviceReport = {
  flow: "create-task",
  device: "mobile",
  mode: "assert",
  status: "pass",
  checkpoints: [],
}

describe("flowOutcomeError", () => {
  it("has nothing to say about a passing run", () => {
    expect(flowOutcomeError(base)).toBeUndefined()
  })

  it("keeps a harness error's own kind", () => {
    const error = flowOutcomeError({
      ...base,
      status: "error",
      error: { kind: "readiness", message: 'Checkpoint "board" never showed its ready element' },
    })
    expect(error).toMatchObject({ kind: "flow/readiness" })
    expect(error?.message).toContain("create-task › mobile")
  })

  it("lists each broken budget limit after the failed checks", () => {
    const failsUntil = { step: "07", reason: "one page" }
    const error = flowOutcomeError({
      ...base,
      status: "fail",
      journey: {
        metrics: { views: 4, typedFields: 0, picks: 1, activations: 2, focusMoves: 9 },
        budget: [
          { metric: "views", max: 1, actual: 4, status: "over" },
          { metric: "picks", max: 1, actual: 1, status: "unexpectedly-met", failsUntil },
          { metric: "activations", max: 1, actual: 2, status: "expected-over", failsUntil },
        ],
      },
    })
    expect(error?.message.split("\n").slice(1)).toEqual([
      "  budget › views: 4, over the limit of 1",
      "  budget › picks: 1 now meets 1; remove its failsUntil (07)",
    ])
  })

  it("lists each failure by checkpoint and variant", () => {
    const error = flowOutcomeError({
      ...base,
      status: "fail",
      checkpoints: [
        {
          index: 0,
          name: "board",
          status: "fail",
          findings: [{ check: "runtime", message: "pageerror: boom" }],
          allowed: [],
          variants: [
            {
              id: "dark.default.default.standard",
              mode: "dark",
              theme: "default",
              density: "default",
              preference: "standard",
              status: "fail",
              findings: [{ check: "axe", message: "color-contrast" }],
              allowed: [],
            },
          ],
        },
      ],
    })
    expect(error).toMatchObject({ kind: "flow/failed" })
    expect(error?.message.split("\n").slice(1)).toEqual([
      "  board › runtime: pageerror: boom",
      "  board › dark.default.default.standard › axe: color-contrast",
    ])
  })
})
