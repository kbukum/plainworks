import type { Page } from "@playwright/test"
import { describe, expect, it } from "vitest"
import { defineFlow } from "./definition"
import { FlowError } from "./errors"
import { planFlowRuns } from "./plan"

const flow = (name: string) =>
  defineFlow({
    name,
    checkpoints: [
      { name: "home", act: async () => undefined, ready: (page: Page) => page.getByRole("main") },
    ],
  })

describe("planFlowRuns", () => {
  it("plans one test per flow and device, carrying the device's context options", () => {
    const planned = planFlowRuns([flow("board"), flow("settings")], { matrix: "quick" })
    expect(planned.map((run) => run.title)).toEqual([
      "board › desktop",
      "board › mobile",
      "settings › desktop",
      "settings › mobile",
    ])
    expect(planned[1]?.use).toMatchObject({
      viewport: { width: 412 },
      isMobile: true,
      hasTouch: true,
    })
    expect(planned[0]?.plan.variants.map((variant) => variant.id)).toEqual([
      "light.default.default.standard",
      "dark.default.default.standard",
    ])
  })

  it("carries the theme axes into every run, so the run applies what was planned", () => {
    const axes = {
      themes: ["indigo"],
      densities: ["compact"],
      defaultTheme: "indigo",
      defaultDensity: "compact",
      root: () => ({ className: "", attributes: {} }),
    }
    const [run] = planFlowRuns([flow("board")], { matrix: "quick", axes })
    expect(run?.axes).toBe(axes)
    expect(run?.plan.variants[0]?.id).toBe("light.indigo.compact.standard")
  })

  it("validates a flow built without defineFlow before planning its artifacts", () => {
    const raw = { name: "a/b", checkpoints: flow("board").checkpoints }
    expect(() => planFlowRuns([raw], { matrix: "quick" })).toThrow(FlowError)
  })

  it("rejects two flows with one name, since they would write over each other", () => {
    expect(() => planFlowRuns([flow("board"), flow("board")], { matrix: "quick" })).toThrow(
      FlowError,
    )
  })
})
