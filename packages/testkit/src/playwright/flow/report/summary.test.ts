import { describe, expect, it } from "vitest"
import type { FlowDeviceReport, VariantReport } from "./schema"
import { summarizeFlowRuns } from "./summary"

const variant = (overrides: Partial<VariantReport> = {}): VariantReport => ({
  id: "light.default.default.standard",
  mode: "light",
  theme: "default",
  density: "default",
  preference: "standard",
  status: "pass",
  findings: [],
  allowed: [],
  ...overrides,
})

const run = (overrides: Partial<FlowDeviceReport> = {}): FlowDeviceReport => ({
  flow: "create-task",
  device: "desktop",
  mode: "capture",
  status: "pass",
  checkpoints: [
    {
      index: 0,
      name: "tasks",
      status: "pass",
      findings: [],
      allowed: [{ check: "runtime", message: "500", reason: "provoked" }],
      variants: [variant({ frame: "flows/create-task/desktop/01-tasks/light.png" }), variant()],
    },
  ],
  ...overrides,
})

describe("summarizeFlowRuns", () => {
  it("passes a run whose every entry passed, counting what it checked and captured", () => {
    expect(summarizeFlowRuns([run(), run({ device: "mobile" })])).toEqual({
      verdict: "pass",
      flows: 1,
      runs: 2,
      checkpoints: 2,
      variants: 4,
      frames: 2,
      failures: 0,
      allowed: 2,
      errors: 0,
    })
  })

  it("fails on any failed check, counting checkpoint and variant findings", () => {
    const failed = run({
      status: "fail",
      checkpoints: [
        {
          index: 0,
          name: "tasks",
          status: "fail",
          findings: [{ check: "hydration", message: "main never hydrated" }],
          allowed: [],
          variants: [variant({ status: "fail", findings: [{ check: "axe", message: "x" }] })],
        },
      ],
    })
    expect(summarizeFlowRuns([run(), failed])).toMatchObject({ verdict: "fail", failures: 2 })
  })

  it("fails on a harness error even with no finding", () => {
    const errored = run({ status: "error", error: { kind: "readiness", message: "never ready" } })
    expect(summarizeFlowRuns([errored])).toMatchObject({ verdict: "fail", errors: 1, failures: 0 })
  })

  it("passes an empty run, which selected nothing to check", () => {
    expect(summarizeFlowRuns([])).toMatchObject({ verdict: "pass", runs: 0 })
  })
})
