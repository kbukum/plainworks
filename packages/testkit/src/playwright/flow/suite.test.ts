import { describe, expect, it } from "vitest"
import { defineFlow } from "./definition"
import { FlowError } from "./errors"
import { FLOW_SUITE_ENV, planFlowSuite } from "./suite"

const flow = (name: string) =>
  defineFlow({
    name,
    checkpoints: [{ name: "start", act: async () => {}, ready: () => ({}) as never }],
  })
const FLOWS = [flow("sign-in"), flow("create-task")]

describe("planFlowSuite", () => {
  it("runs every flow in assert mode at the quick preset by default", () => {
    const suite = planFlowSuite(FLOWS, { env: {} })
    expect(suite.mode).toBe("assert")
    expect(suite.preset).toBe("quick")
    expect(suite.runs.map((run) => run.title)).toEqual([
      "sign-in › desktop",
      "sign-in › mobile",
      "create-task › desktop",
      "create-task › mobile",
    ])
  })

  it("follows the flows, preset, and mode a caller such as ui:capture hands it", () => {
    const suite = planFlowSuite(FLOWS, {
      env: {
        [FLOW_SUITE_ENV.flows]: "create-task",
        [FLOW_SUITE_ENV.preset]: "devices",
        [FLOW_SUITE_ENV.mode]: "capture",
      },
    })
    expect(suite.mode).toBe("capture")
    expect(suite.preset).toBe("devices")
    expect(new Set(suite.runs.map((run) => run.flow.name))).toEqual(new Set(["create-task"]))
    expect(suite.runs.length).toBeGreaterThan(2)
  })

  it.each([
    ["an unknown flow", { [FLOW_SUITE_ENV.flows]: "nope" }],
    ["an unknown preset", { [FLOW_SUITE_ENV.preset]: "huge" }],
    ["an unknown mode", { [FLOW_SUITE_ENV.mode]: "record" }],
  ])("rejects %s as a definition error", (_, env) => {
    expect(() => planFlowSuite(FLOWS, { env })).toThrow(FlowError)
  })
})
