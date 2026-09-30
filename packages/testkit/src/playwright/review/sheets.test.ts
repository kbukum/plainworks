import { describe, expect, it } from "vitest"
import { openFlowRun } from "../flow/report/artifacts"
import { memoryArtifactStore } from "../flow/report/memory-store"
import type { ChangeReview, FlowDeviceReport, FlowReport } from "../flow/report/schema"
import { summarizeFlowRuns } from "../flow/report/summary"
import { writeContactSheets } from "./sheets"

const variant = (id: string) => ({
  id,
  mode: "light" as const,
  theme: "default",
  density: "default",
  preference: "standard" as const,
  status: "pass" as const,
  findings: [],
  allowed: [],
  frame: `flows/tasks/desktop/01-board/${id}.png`,
})

const runs: FlowDeviceReport[] = [
  {
    flow: "tasks",
    device: "desktop",
    mode: "capture",
    status: "pass",
    checkpoints: [
      {
        index: 0,
        name: "board",
        status: "pass",
        findings: [],
        allowed: [],
        variants: [variant("light"), variant("dark")],
      },
      { index: 1, name: "skipped", status: "skipped", findings: [], allowed: [], variants: [] },
    ],
  },
]
const report: FlowReport = {
  schemaVersion: 1,
  runId: "r2",
  createdAt: "2026-01-15T12:00:00.000Z",
  summary: summarizeFlowRuns(runs),
  runs,
}
const review: ChangeReview = {
  status: "compared",
  base: { kind: "snapshot", name: "before", runId: "r1" },
  totals: { unchanged: 1, changed: 1, added: 0, removed: 1, "not-captured": 0 },
  changes: [
    {
      flow: "tasks",
      device: "desktop",
      index: 0,
      checkpoint: "board",
      variant: "dark",
      status: "changed",
      before: "review/tasks/desktop/01-board/dark.before.png",
      after: "flows/tasks/desktop/01-board/dark.png",
      diff: "review/tasks/desktop/01-board/dark.diff.png",
    },
    {
      flow: "tasks",
      device: "desktop",
      index: 0,
      checkpoint: "<old>",
      variant: "light",
      status: "removed",
      before: "review/tasks/desktop/01-old/light.before.png",
    },
  ],
}

describe("writeContactSheets", () => {
  it("writes one labeled grid per captured checkpoint, marking the changed variants", async () => {
    const store = memoryArtifactStore()
    const sheets = await writeContactSheets({ report, review, writer: openFlowRun("/run", store) })
    expect(sheets.checkpoints).toEqual(["sheets/tasks--desktop--01-board.html"])
    const html = await store.read("/run/sheets/tasks--desktop--01-board.html")
    expect(html).toContain('<img src="../flows/tasks/desktop/01-board/light.png" alt="light"')
    expect(html).toContain('data-status="changed"')
    expect(html).toContain("tasks › desktop › 01 board")
    expect(html).not.toContain("<script")
  })

  it("writes a changed-only sheet of before, after, and diff, escaping every label", async () => {
    const store = memoryArtifactStore()
    const sheets = await writeContactSheets({ report, review, writer: openFlowRun("/run", store) })
    expect(sheets.changed).toBe("sheets/changed.html")
    const html = await store.read("/run/sheets/changed.html")
    expect(html).toContain('src="../review/tasks/desktop/01-board/dark.diff.png"')
    expect(html).toContain("&lt;old&gt;")
    expect(html).not.toContain("<old>")
  })

  it("renders each sheet to a PNG when given a renderer, and lists the images", async () => {
    const store = memoryArtifactStore()
    const rendered: string[] = []
    const sheets = await writeContactSheets({
      report,
      review,
      writer: openFlowRun("/run", store),
      render: async (sheet) => {
        rendered.push(`${sheet.html} -> ${sheet.png}`)
      },
    })
    expect(rendered).toEqual([
      "/run/sheets/tasks--desktop--01-board.html -> /run/sheets/tasks--desktop--01-board.png",
      "/run/sheets/changed.html -> /run/sheets/changed.png",
    ])
    expect(sheets).toEqual({
      checkpoints: ["sheets/tasks--desktop--01-board.png"],
      changed: "sheets/changed.png",
    })
  })

  it("writes no changed sheet without a compared review", async () => {
    const store = memoryArtifactStore()
    const sheets = await writeContactSheets({
      report,
      review: { status: "skipped", reason: "no base" },
      writer: openFlowRun("/run", store),
    })
    expect(sheets.changed).toBeUndefined()
  })
})
