import { describe, expect, it } from "vitest"
import { FlowError } from "../errors"
import { parseFlowDeviceReport } from "./parse"
import type { FlowDeviceReport } from "./schema"

const entry: FlowDeviceReport = {
  flow: "create-task",
  device: "mobile",
  mode: "assert",
  status: "fail",
  checkpoints: [
    {
      index: 0,
      name: "tasks",
      status: "fail",
      findings: [{ check: "runtime", message: "pageerror: boom" }],
      allowed: [],
      error: { kind: "readiness", message: "never ready" },
      variants: [
        {
          id: "light.default.default.standard",
          mode: "light",
          theme: "default",
          density: "default",
          preference: "standard",
          status: "fail",
          findings: [{ check: "axe", message: "color-contrast" }],
          allowed: [{ check: "focus", message: "x", reason: "why" }],
        },
      ],
    },
  ],
}

describe("parseFlowDeviceReport", () => {
  it("accepts a run entry written by this schema, through a JSON round trip", () => {
    expect(parseFlowDeviceReport(JSON.parse(JSON.stringify(entry)))).toEqual(entry)
  })

  it.each([
    ["a non-object", 42],
    ["an unknown device", { ...entry, device: "watch" }],
    ["an unknown status", { ...entry, status: "flaky" }],
    ["a missing checkpoint list", { ...entry, checkpoints: undefined }],
    [
      "a finding for an unknown check",
      {
        ...entry,
        checkpoints: [{ ...entry.checkpoints[0], findings: [{ check: "vibes", message: "x" }] }],
      },
    ],
    [
      "a variant without an id",
      {
        ...entry,
        checkpoints: [{ ...entry.checkpoints[0], variants: [{ status: "pass" }] }],
      },
    ],
  ])("rejects %s with a report error", (_, value) => {
    let caught: unknown
    try {
      parseFlowDeviceReport(value)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(FlowError)
    expect(caught).toMatchObject({ kind: "flow/report" })
  })
})
