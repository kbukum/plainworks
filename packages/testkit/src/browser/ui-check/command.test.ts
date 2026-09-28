import type { Locator, Page } from "@playwright/test"
import { PNG } from "pngjs"
import { describe, expect, it } from "vitest"
import { defineFlow } from "../flow/definition"
import { FLOW_RUN_ENV, flowArtifactPaths, openFlowRun } from "../flow/report/artifacts"
import { memoryArtifactStore } from "../flow/report/memory-store"
import type { FlowDeviceReport, FlowReport } from "../flow/report/schema"
import { FLOW_SUITE_ENV, planFlowSuite } from "../flow/suite"
import { GATE_ORIGIN_ENV } from "../gate"
import { runUiCheck, type SuiteInvocation, UI_CHECK_EXIT, type UiCheckRuntime } from "./command"
import type { UiCheckConfig } from "./config"
import { UiCheckError } from "./errors"
import type { GitRunner } from "./git"

const ready = (page: Page): Locator => page.locator("main")
const flows = [
  defineFlow({
    name: "tasks",
    covers: ["apps/showcase/src/routes/tasks/**"],
    checkpoints: [{ name: "board", act: async () => {}, ready }],
  }),
  defineFlow({
    name: "shell",
    covers: ["apps/showcase/src/shell/**"],
    checkpoints: [{ name: "home", act: async () => {}, ready }],
  }),
]

const config: UiCheckConfig = {
  app: "@plainworks/showcase",
  appDir: "apps/showcase",
  root: "/ui",
  spec: "e2e/flows.spec.ts",
  flows,
  host: { command: ["bun", "run", "server.ts"], basePort: 5199, readyPath: "/@vite/client" },
  warmPort: 5190,
  ignore: ["**/*.md"],
}

/** A frame with a 24×24 dark block at `left`. */
function png(left: number): Uint8Array {
  const image = new PNG({ width: 60, height: 30 })
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 60; x++) {
      const dark = x >= left && x < left + 24 && y < 24
      image.data.set(dark ? [20, 20, 20, 255] : [255, 255, 255, 255], (y * 60 + x) * 4)
    }
  }
  return new Uint8Array(PNG.sync.write(image))
}

interface Scenario {
  /** Where each flow's block sits; move it to make a visual change. */
  left?: number
  status?: FlowDeviceReport["status"]
  exitCode?: number
  /** Report only this many runs, as when Playwright crashes. */
  limit?: number
}

function harness(options: { git?: Record<string, string>; warm?: boolean } = {}) {
  const store = memoryArtifactStore()
  const lines: string[] = []
  const suites: SuiteInvocation[] = []
  const captures: string[] = []
  let clock = Date.parse("2026-01-15T12:00:00.000Z")
  const scenario: Scenario = {}
  let baseScenario: Scenario | Error = {}

  async function capture(dir: string, env: Readonly<Record<string, string>>, at: Scenario) {
    const writer = openFlowRun(dir, store)
    const { runs } = planFlowSuite(flows, { env })
    for (const planned of runs.slice(0, at.limit ?? runs.length)) {
      const device = planned.plan.device.id
      const [checkpoint] = planned.flow.checkpoints
      const location = {
        flow: planned.flow.name,
        device,
        index: 0,
        checkpoint: checkpoint?.name ?? "",
      }
      const frame = await writer.write(
        flowArtifactPaths.variant(location, "light", "png"),
        png(at.left ?? 4),
      )
      const aria = await writer.write(
        flowArtifactPaths.variant(location, "light", "aria.yml"),
        "- main\n",
      )
      const entry: FlowDeviceReport = {
        flow: planned.flow.name,
        device,
        mode: "capture",
        status: at.status ?? "pass",
        checkpoints: [
          {
            index: 0,
            name: location.checkpoint,
            status: "pass",
            findings: [],
            allowed: [],
            variants: [
              {
                id: "light",
                mode: "light",
                theme: "default",
                density: "default",
                preference: "standard",
                status: "pass",
                findings: [],
                allowed: [],
                frame,
                aria,
              },
            ],
          },
        ],
      }
      await writer.write(flowArtifactPaths.entry(planned.flow.name, device), JSON.stringify(entry))
    }
  }

  const answers: Record<string, string> = {
    "merge-base HEAD origin/main": "base0000000000000\n",
    ...options.git,
  }
  const git: GitRunner = async (args) => {
    const answer = answers[args.join(" ")]
    if (answer === undefined) throw new Error(`fatal: bad git ${args.join(" ")}`)
    return answer
  }
  const runtime: UiCheckRuntime = {
    store,
    git,
    serving: async () => options.warm === true,
    runSuite: async (invocation) => {
      suites.push(invocation)
      const dir = invocation.env[FLOW_RUN_ENV] ?? ""
      await capture(dir, invocation.env, scenario)
      return scenario.exitCode ?? 0
    },
    captureBase: async ({ commit, run, env }) => {
      captures.push(commit)
      if (baseScenario instanceof Error) throw baseScenario
      await capture(run.dir, env, baseScenario)
    },
    serve: async () => void lines.push("serving"),
    now: () => (clock += 1000),
    print: (line) => void lines.push(line),
  }
  const report = async (): Promise<FlowReport> => {
    const target = store.links.get("/ui/latest") ?? ""
    return JSON.parse(await store.read(`/ui/${target}/report.json`))
  }
  return {
    store,
    lines,
    suites,
    captures,
    scenario,
    setBase: (next: Scenario | Error) => {
      baseScenario = next
    },
    report,
    check: (argv: string[], override: Partial<UiCheckConfig> = {}) =>
      runUiCheck(argv, { ...config, ...override }, runtime),
  }
}

describe("runUiCheck", () => {
  it("captures every flow, publishes the report, and says there is no base yet", async () => {
    const h = harness()
    expect(await h.check([])).toBe(UI_CHECK_EXIT.pass)
    const [suite] = h.suites
    expect(suite?.env).toMatchObject({
      [FLOW_SUITE_ENV.flows]: "tasks,shell",
      [FLOW_SUITE_ENV.preset]: "quick",
      [FLOW_SUITE_ENV.mode]: "capture",
    })
    expect(suite?.env[FLOW_RUN_ENV]).toMatch(/^\/ui\/runs\//)
    expect(suite?.env[GATE_ORIGIN_ENV]).toBeUndefined()
    expect(suite?.workers).toBeUndefined()
    const report = await h.report()
    expect(report.summary).toMatchObject({ verdict: "pass", runs: 4 })
    expect(report.selection).toMatchObject({ by: "all", preset: "quick" })
    expect(report.review).toMatchObject({
      status: "skipped",
      reason: expect.stringContaining("--save-as before"),
    })
    expect(report.sheets?.checkpoints).toHaveLength(4)
    expect(h.lines.at(-1)).toMatch(/^Report: \/ui\/runs\/.+\/report\.md/)
  })

  it("reuses a warm host with a single worker", async () => {
    const h = harness({ warm: true })
    expect(await h.check(["--flow", "tasks"])).toBe(UI_CHECK_EXIT.pass)
    expect(h.suites[0]?.env).toMatchObject({
      [GATE_ORIGIN_ENV]: "http://127.0.0.1:5190",
      [FLOW_SUITE_ENV.flows]: "tasks",
    })
    expect(h.suites[0]?.workers).toBe(1)
    expect(h.lines).toContain("Reusing the warm host at http://127.0.0.1:5190.")
  })

  it("compares with the before snapshot and reports a visual change without failing", async () => {
    const h = harness()
    expect(await h.check(["--save-as", "before"])).toBe(UI_CHECK_EXIT.pass)
    expect((await h.report()).review).toMatchObject({ status: "skipped" })
    expect(h.store.files.has("/ui/snapshots/before/report.json")).toBe(true)

    h.scenario.left = 30
    expect(await h.check([])).toBe(UI_CHECK_EXIT.pass)
    const report = await h.report()
    expect(report.review).toMatchObject({
      status: "compared",
      base: { kind: "snapshot", name: "before" },
      totals: { changed: 4, added: 0, removed: 0, unchanged: 0, "not-captured": 0 },
    })
    expect(report.sheets?.changed).toBe("sheets/changed.html")
    expect(h.lines).toContain(
      'Visual changes against snapshot "before": 4 changed, 0 added, 0 removed, 0 unchanged.',
    )
  })

  it("skips the review with --no-diff", async () => {
    const h = harness()
    await h.check(["--save-as", "before"])
    expect(await h.check(["--no-diff"])).toBe(UI_CHECK_EXIT.pass)
    expect((await h.report()).review).toEqual({
      status: "skipped",
      reason: "Skipped with --no-diff",
    })
  })

  it("captures a git base once, reuses it, and evicts old bases", async () => {
    const h = harness({ git: { "merge-base HEAD main": "c0ffee0000000000\n" } })
    for (const key of ["old-1", "old-2", "old-3"]) {
      await h.store.write(`/ui/bases/${key}/report.json`, "{}")
    }
    expect(await h.check(["--base", "main"])).toBe(UI_CHECK_EXIT.pass)
    expect(await h.check(["--base", "main"])).toBe(UI_CHECK_EXIT.pass)
    expect(h.captures).toEqual(["c0ffee0000000000"])
    expect((await h.report()).review).toMatchObject({
      status: "compared",
      base: { kind: "git", name: "main", commit: "c0ffee000000" },
      totals: { unchanged: 4 },
    })
    const bases = await h.store.list("/ui/bases")
    expect(bases).toHaveLength(3)
    expect(bases.some((key) => key.startsWith("c0ffee000000-"))).toBe(true)
  })

  it("exits with the harness code when the base cannot be captured, still publishing the run", async () => {
    const h = harness({ git: { "merge-base HEAD main": "c0ffee0000000000\n" } })
    h.setBase(new UiCheckError("base", "bun install failed in the base worktree"))
    expect(await h.check(["--base", "main"])).toBe(UI_CHECK_EXIT.harness)
    expect((await h.report()).review).toMatchObject({
      status: "skipped",
      reason: expect.stringContaining("bun install failed"),
    })
    expect(h.lines.at(-1)).toContain("harness error: bun install failed")
  })

  it("fails on a failed flow, and on a Playwright failure the report does not show", async () => {
    const failing = harness()
    failing.scenario.status = "fail"
    expect(await failing.check([])).toBe(UI_CHECK_EXIT.fail)

    const crashed = harness()
    crashed.scenario.exitCode = 1
    expect(await crashed.check([])).toBe(UI_CHECK_EXIT.fail)
    expect(crashed.lines.some((line) => line.startsWith("Playwright exited with 1"))).toBe(true)
  })

  it("exits with the harness code when runs are missing from the report", async () => {
    const h = harness()
    h.scenario.limit = 3
    h.scenario.exitCode = 1
    expect(await h.check([])).toBe(UI_CHECK_EXIT.harness)
    expect(h.lines.some((line) => line.includes("only 3 of 4 flow runs reported"))).toBe(true)
  })

  it("exits with the harness code on a usage error", async () => {
    const h = harness()
    expect(await h.check(["--flow", "nope"])).toBe(UI_CHECK_EXIT.harness)
    expect(h.lines[0]).toContain('Unknown flow "nope"')
    expect(await h.check(["--wat"])).toBe(UI_CHECK_EXIT.harness)
    expect(h.suites).toHaveLength(0)
  })

  it("runs only the affected flows, or nothing when no change reaches a flow", async () => {
    const touched = harness({
      git: {
        "diff --name-only --no-renames -z base0000000000000":
          "apps/showcase/src/shell/nav.tsx\0README.md\0",
        "ls-files --others --exclude-standard --full-name -z -- :/": "",
      },
    })
    expect(await touched.check(["--affected"])).toBe(UI_CHECK_EXIT.pass)
    expect(touched.suites[0]?.env[FLOW_SUITE_ENV.flows]).toBe("shell")
    expect((await touched.report()).selection).toMatchObject({
      by: "affected",
      since: "base00000000",
      changedFiles: 2,
      flows: [{ name: "shell", reasons: ["covers apps/showcase/src/shell/nav.tsx"] }],
    })

    const docs = harness({
      git: {
        "diff --name-only --no-renames -z base0000000000000": "README.md\0",
        "ls-files --others --exclude-standard --full-name -z -- :/": "",
      },
    })
    expect(await docs.check(["--affected"])).toBe(UI_CHECK_EXIT.pass)
    expect(docs.suites).toHaveLength(0)
    expect(docs.lines[0]).toContain("nothing ran")
  })

  it("fails safe to every flow when a changed file is covered by none", async () => {
    const h = harness({
      git: {
        "diff --name-only --no-renames -z base0000000000000": "packages/std/src/result.ts\0",
        "ls-files --others --exclude-standard --full-name -z -- :/": "",
      },
    })
    expect(await h.check(["--affected"])).toBe(UI_CHECK_EXIT.pass)
    expect(h.suites[0]?.env[FLOW_SUITE_ENV.flows]).toBe("tasks,shell")
    expect((await h.report()).selection?.unmapped).toEqual(["packages/std/src/result.ts"])
  })

  it("exits with the harness code when the affected base cannot be found", async () => {
    const h = harness()
    expect(await h.check(["--affected"], { affectedBase: "upstream/main" })).toBe(
      UI_CHECK_EXIT.harness,
    )
    expect(h.lines[0]).toContain('"upstream/main"')
  })

  it("prints usage for help, and hands serve to the runtime", async () => {
    const h = harness()
    expect(await h.check(["--help"])).toBe(UI_CHECK_EXIT.pass)
    expect(h.lines[0]).toContain("Usage: ui:check")
    expect(await h.check(["serve"])).toBe(UI_CHECK_EXIT.pass)
    expect(h.lines).toContain("serving")
  })
})
