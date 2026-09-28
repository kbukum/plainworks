import type { Page } from "@playwright/test"
import { describe, expect, it } from "vitest"
import { defineFlow } from "../flow/definition"
import { selectAffectedFlows } from "./affected"

const checkpoints = [
  { name: "home", act: async () => {}, ready: (page: Page) => page.locator("main") },
]
const tasks = defineFlow({
  name: "tasks",
  covers: ["apps/showcase/src/routes/tasks/**"],
  checkpoints,
})
const board = defineFlow({
  name: "board",
  covers: ["apps/showcase/src/routes/tasks/board.tsx", "packages/ui/src/client/data/**"],
  checkpoints,
})
const shell = defineFlow({ name: "shell", checkpoints })
const flows = [tasks, board, shell]
const ignore = ["**/*.md", "**/*.test.{ts,tsx}"]

describe("selectAffectedFlows", () => {
  it("picks the flows whose covers match a changed file, saying which files", () => {
    expect(
      selectAffectedFlows({
        flows,
        changed: [
          "apps/showcase/src/routes/tasks/board.tsx",
          "apps/showcase/src/routes/tasks/new.tsx",
        ],
        ignore,
      }),
    ).toEqual({
      unmapped: [],
      flows: [
        {
          name: "tasks",
          reasons: [
            "covers apps/showcase/src/routes/tasks/board.tsx",
            "covers apps/showcase/src/routes/tasks/new.tsx",
          ],
        },
        { name: "board", reasons: ["covers apps/showcase/src/routes/tasks/board.tsx"] },
      ],
    })
  })

  it("runs nothing when every changed file is ignored", () => {
    expect(
      selectAffectedFlows({ flows, changed: ["README.md", "packages/ui/src/a.test.tsx"], ignore }),
    ).toEqual({ unmapped: [], flows: [] })
  })

  it("fails safe to every flow when a changed file is covered by none", () => {
    const selection = selectAffectedFlows({
      flows,
      changed: ["packages/std/src/result.ts", "packages/ui/src/client/data/table.tsx"],
      ignore,
    })
    expect(selection.unmapped).toEqual(["packages/std/src/result.ts"])
    expect(selection.flows.map((flow) => flow.name)).toEqual(["tasks", "board", "shell"])
    expect(selection.flows[1]?.reasons).toEqual([
      "covers packages/ui/src/client/data/table.tsx",
      "fail safe: no flow covers packages/std/src/result.ts",
    ])
    expect(selection.flows[2]?.reasons).toEqual([
      "fail safe: no flow covers packages/std/src/result.ts",
    ])
  })

  it("keeps each flow's reasons short when many files changed", () => {
    const changed = Array.from(
      { length: 7 },
      (_, index) => `apps/showcase/src/routes/tasks/f${index}.tsx`,
    )
    const unmapped = Array.from({ length: 5 }, (_, index) => `x/${index}.ts`)
    const [first] = selectAffectedFlows({
      flows: [tasks],
      changed: [...changed, ...unmapped],
    }).flows
    expect(first?.reasons).toEqual([
      "covers apps/showcase/src/routes/tasks/f0.tsx",
      "covers apps/showcase/src/routes/tasks/f1.tsx",
      "covers apps/showcase/src/routes/tasks/f2.tsx",
      "covers 4 more changed files",
      "fail safe: no flow covers x/0.ts, x/1.ts, x/2.ts and 2 more",
    ])
  })
})
