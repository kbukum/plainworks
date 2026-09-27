import { describe, expect, it } from "vitest"
import { COMPACT_MATRIX, FULL_MATRIX } from "./matrix"
import { planVisualTests, type VisualSurface } from "./surface"

const arrange = async (): Promise<void> => {}

describe("planVisualTests", () => {
  it("plans one titled test and one named baseline per declared variant", () => {
    const surfaces: VisualSurface[] = [
      { name: "tasks", matrix: FULL_MATRIX, arrange },
      { name: "task-dialog", matrix: COMPACT_MATRIX, arrange },
    ]
    const plan = planVisualTests(surfaces)
    expect(plan).toHaveLength(12)
    expect(plan[0]).toMatchObject({
      title: "tasks light-desktop",
      snapshot: "tasks-light-desktop.png",
    })
    expect(plan.at(-1)).toMatchObject({ snapshot: "task-dialog-dark-mobile.png" })
  })

  it("rejects a name that is not a lowercase slug, since it names baseline files", () => {
    expect(() =>
      planVisualTests([{ name: "Task Dialog", matrix: COMPACT_MATRIX, arrange }]),
    ).toThrow(RangeError)
  })

  it("rejects two surfaces with one name, which would share baselines", () => {
    expect(() =>
      planVisualTests([
        { name: "tasks", matrix: COMPACT_MATRIX, arrange },
        { name: "tasks", matrix: FULL_MATRIX, arrange },
      ]),
    ).toThrow(/tasks/)
  })
})
