import { describe, expect, it } from "vitest"
import { renderFlowReportMarkdown } from "./markdown"
import type { FlowReport } from "./schema"
import { summarizeFlowRuns } from "./summary"

const evidence = {
  dom: "flows/create-task/mobile/02-new-task/light.dom.html",
  aria: "flows/create-task/mobile/02-new-task/light.aria.yml",
  console: "flows/create-task/mobile/02-new-task/light.console.json",
  network: "flows/create-task/mobile/02-new-task/light.network.json",
  frame: "flows/create-task/mobile/02-new-task/light.png",
}

function report(runs: FlowReport["runs"]): FlowReport {
  return {
    schemaVersion: 1,
    runId: "2026-01-15T12-00-00-000Z",
    createdAt: "2026-01-15T12:00:00.000Z",
    summary: summarizeFlowRuns(runs),
    runs,
  }
}

const passing: FlowReport["runs"][number] = {
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
      allowed: [
        { check: "runtime", message: "console: status of 500", reason: "provoked error state" },
      ],
      variants: [],
    },
  ],
}

const failing: FlowReport["runs"][number] = {
  flow: "create-task",
  device: "mobile",
  mode: "capture",
  status: "error",
  error: { kind: "readiness", message: 'Checkpoint "new-task" never became ready' },
  checkpoints: [
    {
      index: 1,
      name: "new-task",
      status: "error",
      findings: [],
      allowed: [],
      error: { kind: "readiness", message: 'Checkpoint "new-task" never became ready' },
      evidence,
      variants: [
        {
          id: "light.default.default.standard",
          mode: "light",
          theme: "default",
          density: "default",
          preference: "standard",
          status: "fail",
          findings: [{ check: "axe", message: "color-contrast: low | contrast" }],
          allowed: [],
          evidence,
        },
      ],
    },
  ],
}

describe("renderFlowReportMarkdown", () => {
  it("leads with the verdict and a table of every flow on every device", () => {
    const markdown = renderFlowReportMarkdown(report([passing]))
    expect(markdown).toContain("**Verdict: pass**")
    expect(markdown).toContain("| create-task | desktop | pass | 1 | 0 | 0 |")
    expect(markdown).not.toContain("## Failures")
  })

  it("lists each failure with links to its evidence", () => {
    const markdown = renderFlowReportMarkdown(report([passing, failing]))
    expect(markdown).toContain("**Verdict: fail**")
    expect(markdown).toContain("### create-task › mobile › 02 new-task")
    expect(markdown).toContain(
      '- **readiness:** Checkpoint "new-task" never became ready — [frame](flows/create-task/mobile/02-new-task/light.png)',
    )
    expect(markdown).toContain(
      "- `light.default.default.standard` **axe:** color-contrast: low | contrast",
    )
  })

  it("folds a multi-line message onto one list line", () => {
    const run: FlowReport["runs"][number] = {
      ...failing,
      checkpoints: failing.checkpoints.map((checkpoint) => ({
        ...checkpoint,
        error: {
          kind: "action",
          message: `  click failed\n\n   at step 3  \n${" ".repeat(50_000)}\n`,
        },
      })),
    }
    expect(renderFlowReportMarkdown(report([run]))).toContain(
      "- **action:** click failed at step 3 — [frame]",
    )
  })

  it("keeps every accepted finding visible with the reason it was allowed", () => {
    expect(renderFlowReportMarkdown(report([passing]))).toContain(
      "- create-task › desktop › 01 tasks — **runtime:** console: status of 500 _(allowed: provoked error state)_",
    )
  })
})

describe("renderFlowReportMarkdown for ui:check", () => {
  it("explains the selection, then the visual changes with their files and sheets", () => {
    const markdown = renderFlowReportMarkdown({
      ...report([passing]),
      selection: {
        by: "affected",
        preset: "quick",
        since: "abc1234",
        changedFiles: 3,
        unmapped: ["packages/std/src/x.ts"],
        flows: [
          { name: "create-task", reasons: ["fail safe: packages/std/src/x.ts is not covered"] },
        ],
      },
      review: {
        status: "compared",
        base: { kind: "git", name: "origin/main", commit: "abc1234", runId: "r1" },
        totals: { unchanged: 3, changed: 1, added: 1, removed: 0, "not-captured": 2 },
        changes: [
          {
            flow: "create-task",
            device: "desktop",
            index: 0,
            checkpoint: "tasks",
            variant: "dark.default.default.standard",
            status: "changed",
            pixels: { different: 640, total: 1_296_000, sizeChanged: false },
            ariaChanged: true,
            before: "review/a.before.png",
            after: "flows/a.png",
            diff: "review/a.diff.png",
            ariaDiff: "review/a.aria.diff",
          },
          {
            flow: "create-task",
            device: "desktop",
            index: 1,
            checkpoint: "new-task",
            variant: "light.default.default.standard",
            status: "added",
            after: "flows/b.png",
          },
        ],
      },
      sheets: { checkpoints: ["sheets/a.png"], changed: "sheets/changed.png" },
    })
    expect(markdown).toContain("## Selection")
    expect(markdown).toContain("Affected by 3 changed files since `abc1234`, preset `quick`.")
    expect(markdown).toContain(
      "- **create-task** — fail safe: packages/std/src/x.ts is not covered",
    )
    expect(markdown).toContain("## Visual changes")
    expect(markdown).toContain(
      "Against git `origin/main` (`abc1234`): 1 changed, 1 added, 0 removed, 3 unchanged, 2 not captured (their flow errored or did not run).",
    )
    expect(markdown).toContain(
      "- changed `create-task › desktop › 01 tasks › dark.default.default.standard` — 640 px, ARIA changed — [before](review/a.before.png) · [after](flows/a.png) · [diff](review/a.diff.png) · [ARIA diff](review/a.aria.diff)",
    )
    expect(markdown).toContain(
      "- added `create-task › desktop › 02 new-task › light.default.default.standard` — [after](flows/b.png)",
    )
    expect(markdown).toContain(
      "Contact sheets: [changed only](sheets/changed.png) · [01](sheets/a.png)",
    )
    expect(markdown.indexOf("## Visual changes")).toBeLessThan(markdown.indexOf("| Flow |"))
  })

  it("says why no review ran", () => {
    const markdown = renderFlowReportMarkdown({
      ...report([passing]),
      review: { status: "skipped", reason: "No base: run ui:check --save-as before first" },
    })
    expect(markdown).toContain(
      "## Visual changes\n\nNot reviewed: No base: run ui:check --save-as before first",
    )
  })
})
