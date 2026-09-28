import { describe, expect, it } from "vitest"
import { diffAriaSnapshots } from "./aria-diff"

const tree = (...lines: string[]) => `${lines.join("\n")}\n`

describe("diffAriaSnapshots", () => {
  it("finds equal trees unchanged, ignoring trailing whitespace", () => {
    const result = diffAriaSnapshots(
      tree("- main", '  - heading "Tasks"'),
      '- main  \n  - heading "Tasks"',
    )
    expect(result).toEqual({ changed: false, diff: "" })
  })

  it("marks removed and added lines, keeping two lines of context", () => {
    const before = tree(
      "- banner",
      "- main",
      '  - heading "Tasks"',
      '  - button "New task"',
      "- a",
      "- b",
      "- c",
      "- contentinfo",
    )
    const after = tree(
      "- banner",
      "- main",
      '  - heading "Tasks"',
      '  - button "Add task"',
      "- a",
      "- b",
      "- c",
      "- contentinfo",
    )
    expect(diffAriaSnapshots(before, after)).toEqual({
      changed: true,
      diff: [
        "  …",
        "  - main",
        '    - heading "Tasks"',
        '-   - button "New task"',
        '+   - button "Add task"',
        "  - a",
        "  - b",
        "  …",
      ].join("\n"),
    })
  })

  it("falls back to whole-tree replacement past its size budget", () => {
    const before = Array.from({ length: 30 }, (_, i) => `- item ${i}`).join("\n")
    const after = Array.from({ length: 30 }, (_, i) => `- entry ${i}`).join("\n")
    const result = diffAriaSnapshots(before, after, { maxCells: 100 })
    expect(result.changed).toBe(true)
    expect(result.diff.split("\n").filter((line) => line.startsWith("-"))).toHaveLength(30)
    expect(result.diff.split("\n").filter((line) => line.startsWith("+"))).toHaveLength(30)
  })
})
