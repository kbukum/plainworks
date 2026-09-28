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

  it("accepts the repository paths a flow covers", () => {
    const flow = {
      name: "tasks",
      covers: ["apps/showcase/src/routes/tasks/**", "packages/ui/src/client/data/**"],
      checkpoints: [checkpoint("board")],
    }
    expect(defineFlow(flow).covers).toHaveLength(2)
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
    ["an empty covers pattern", { name: "f", covers: [" "], checkpoints: [checkpoint("a")] }],
    [
      "an absolute covers pattern",
      { name: "f", covers: ["/src/**"], checkpoints: [checkpoint("a")] },
    ],
    [
      "a climbing covers pattern",
      { name: "f", covers: ["../x/**"], checkpoints: [checkpoint("a")] },
    ],
    [
      "a backslash covers pattern",
      { name: "f", covers: ["src\\a"], checkpoints: [checkpoint("a")] },
    ],
  ])("rejects %s with a definition error", (_, flow) => {
    const error = definitionError(() => defineFlow(flow))
    expect(error).toBeInstanceOf(FlowError)
    expect(error).toMatchObject({ kind: "flow/definition" })
  })
})
