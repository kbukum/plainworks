import type { Locator, Page } from "@playwright/test"
import { describe, expect, it } from "vitest"
import { defineFlow, type FlowCheckpoint } from "./definition"
import { FlowError } from "./errors"

const noop = async (): Promise<void> => undefined
const ready = (page: Page): Locator => page.getByRole("main")
const checkpoint = (name: string, extra: Partial<FlowCheckpoint> = {}): FlowCheckpoint => ({
  name,
  act: noop,
  ready,
  ...extra,
})

const definitionError = (define: () => unknown): unknown => {
  try {
    define()
  } catch (error) {
    return error
  }
  return undefined
}

describe("defineFlow", () => {
  it("returns a valid flow unchanged", () => {
    const flow = { name: "create-task", checkpoints: [checkpoint("tasks"), checkpoint("new-task")] }
    expect(defineFlow(flow)).toBe(flow)
  })

  it("accepts a single surface as a one-checkpoint flow", () => {
    expect(
      defineFlow({ name: "login", checkpoints: [checkpoint("login")] }).checkpoints,
    ).toHaveLength(1)
  })

  it.each([
    ["a flow name that is not a slug", { name: "Create Task", checkpoints: [checkpoint("a")] }],
    ["a flow with no checkpoints", { name: "empty", checkpoints: [] }],
    ["a checkpoint name that is not a slug", { name: "f", checkpoints: [checkpoint("New task")] }],
    [
      "two checkpoints with one name",
      { name: "f", checkpoints: [checkpoint("a"), checkpoint("a")] },
    ],
    [
      "an allowance without a reason",
      { name: "f", checkpoints: [checkpoint("a", { allow: [{ check: "axe", reason: "  " }] })] },
    ],
    [
      "a stateful allowance pattern",
      {
        name: "f",
        checkpoints: [
          checkpoint("a", { allow: [{ check: "runtime", match: /500/g, reason: "x" }] }),
        ],
      },
    ],
  ])("rejects %s with a definition error", (_, flow) => {
    const error = definitionError(() => defineFlow(flow))
    expect(error).toBeInstanceOf(FlowError)
    expect(error).toMatchObject({ kind: "flow/definition" })
  })
})
