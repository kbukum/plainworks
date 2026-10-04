import type { Locator, Page } from "@playwright/test"
import { PNG } from "pngjs"
import { describe, expect, it } from "vitest"
import { defineFlow, type Flow } from "../flow/definition"
import type { FlowMode } from "../flow/matrix/axes"
import { FLOW_RUN_ENV, flowArtifactPaths, openFlowRun } from "../flow/report/artifacts"
import { memoryArtifactStore } from "../flow/report/memory-store"
import type { FlowDeviceReport, FlowReport } from "../flow/report/schema"
import { FLOW_SUITE_ENV, planFlowSuite } from "../flow/suite"
import { GATE_ORIGIN_ENV } from "../gate"
import {
  runUiCapture,
  type SuiteInvocation,
  UI_CAPTURE_EXIT,
  type UiCaptureRuntime,
} from "./command"
import type { UiCaptureConfig } from "./config"
import { UiCaptureError } from "./errors"
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

const config: UiCaptureConfig = {
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
  /** The page modes each checkpoint captures. Defaults to light only. */
  modes?: readonly FlowMode[]
}

function harness(
  options: { git?: Record<string, string>; warm?: boolean; flows?: readonly Flow[] } = {},
) {
  const suiteFlows = options.flows ?? flows
  const store = memoryArtifactStore()
  const lines: string[] = []
  const suites: SuiteInvocation[] = []
  const captures: string[] = []
  let clock = Date.parse("2026-01-15T12:00:00.000Z")
  const scenario: Scenario = {}
  let baseScenario: Scenario | Error = {}

  async function capture(dir: string, env: Readonly<Record<string, string>>, at: Scenario) {
    const writer = openFlowRun(dir, store)
    const { runs } = planFlowSuite(suiteFlows, { env })
    for (const planned of runs.slice(0, at.limit ?? runs.length)) {
      const device = planned.plan.device.id
      const checkpoints = []
      for (const [index, checkpoint] of planned.flow.checkpoints.entries()) {
        const location = { flow: planned.flow.name, device, index, checkpoint: checkpoint.name }
        const variants = []
        for (const mode of at.modes ?? ["light"]) {
          const frame = await writer.write(
            flowArtifactPaths.variant(location, mode, "png"),
            png(at.left ?? (mode === "dark" ? 30 : 4)),
          )
          const aria = await writer.write(
            flowArtifactPaths.variant(location, mode, "aria.yml"),
            "- main\n",
          )
          variants.push({
            id: mode,
            mode,
            theme: "default",
            density: "default",
            preference: "standard" as const,
            status: "pass" as const,
            findings: [],
            allowed: [],
            frame,
            aria,
          })
        }
        checkpoints.push({
          index,
          name: checkpoint.name,
          status: "pass" as const,
          findings: [],
          allowed: [],
          variants,
        })
      }
      const entry: FlowDeviceReport = {
        flow: planned.flow.name,
        device,
        mode: "capture",
        status: at.status ?? "pass",
        checkpoints,
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
  const runtime: UiCaptureRuntime = {
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
    serve: async (mode) => void lines.push(`serving:${mode}`),
    clock: { now: () => (clock += 1000) },
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
    capture: (argv: string[], override: Partial<UiCaptureConfig> = {}) =>
      runUiCapture(argv, { ...config, flows: suiteFlows, ...override }, runtime),
  }
}

describe("runUiCapture", () => {
  it("uses configured HTTPS for warm-host lookup and single-worker capture", async () => {
    const h = harness({ warm: true })
    await h.capture([], { host: { ...config.host, origin: (port) => `https://localhost:${port}` } })
    expect(h.suites[0]?.env[GATE_ORIGIN_ENV]).toBe("https://localhost:5190")
    expect(h.suites[0]?.workers).toBe(1)
  })
  it("captures every flow and publishes the report, comparing nothing without --base", async () => {
    const h = harness()
    expect(await h.capture([])).toBe(UI_CAPTURE_EXIT.pass)
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
    expect(report.review).toBeUndefined()
    expect(report.sheets?.checkpoints).toHaveLength(4)
    expect(h.lines.at(-1)).toMatch(/^Report: \/ui\/runs\/.+\/report\.md/)
  })

  it("reuses a warm host with a single worker", async () => {
    const h = harness({ warm: true })
    expect(await h.capture(["--flow", "tasks"])).toBe(UI_CAPTURE_EXIT.pass)
    expect(h.suites[0]?.env).toMatchObject({
      [GATE_ORIGIN_ENV]: "http://127.0.0.1:5190",
      [FLOW_SUITE_ENV.flows]: "tasks",
    })
    expect(h.suites[0]?.workers).toBe(1)
    expect(h.lines).toContain("Reusing the warm host at http://127.0.0.1:5190.")
  })

  it("compares with a saved snapshot and reports a visual change without failing", async () => {
    const h = harness()
    expect(await h.capture(["--save-as", "before"])).toBe(UI_CAPTURE_EXIT.pass)
    expect((await h.report()).review).toBeUndefined()
    expect(h.store.files.has("/ui/snapshots/before/report.json")).toBe(true)

    h.scenario.left = 30
    expect(await h.capture(["--base", "before"])).toBe(UI_CAPTURE_EXIT.pass)
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

  it("captures a git base once, reuses it, and evicts old bases", async () => {
    const h = harness({ git: { "merge-base HEAD main": "c0ffee0000000000\n" } })
    for (const key of ["old-1", "old-2", "old-3"]) {
      await h.store.write(`/ui/bases/${key}/report.json`, "{}")
    }
    expect(await h.capture(["--base", "main"])).toBe(UI_CAPTURE_EXIT.pass)
    expect(await h.capture(["--base", "main"])).toBe(UI_CAPTURE_EXIT.pass)
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
    h.setBase(new UiCaptureError("base", "bun install failed in the base worktree"))
    expect(await h.capture(["--base", "main"])).toBe(UI_CAPTURE_EXIT.harness)
    expect((await h.report()).review).toMatchObject({
      status: "skipped",
      reason: expect.stringContaining("bun install failed"),
    })
    expect(h.lines.at(-1)).toContain("harness error: bun install failed")
  })

  it("fails on a failed flow, and on a Playwright failure the report does not show", async () => {
    const failing = harness()
    failing.scenario.status = "fail"
    expect(await failing.capture([])).toBe(UI_CAPTURE_EXIT.fail)

    const crashed = harness()
    crashed.scenario.exitCode = 1
    expect(await crashed.capture([])).toBe(UI_CAPTURE_EXIT.fail)
    expect(crashed.lines.some((line) => line.startsWith("Playwright exited with 1"))).toBe(true)
  })

  it("exits with the harness code when runs are missing from the report", async () => {
    const h = harness()
    h.scenario.limit = 3
    h.scenario.exitCode = 1
    expect(await h.capture([])).toBe(UI_CAPTURE_EXIT.harness)
    expect(h.lines.some((line) => line.includes("only 3 of 4 flow runs reported"))).toBe(true)
  })

  it("exits with the harness code on a usage error", async () => {
    const h = harness()
    expect(await h.capture(["--flow", "nope"])).toBe(UI_CAPTURE_EXIT.harness)
    expect(h.lines[0]).toContain('Unknown flow "nope"')
    expect(await h.capture(["--wat"])).toBe(UI_CAPTURE_EXIT.harness)
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
    expect(await touched.capture(["--affected"])).toBe(UI_CAPTURE_EXIT.pass)
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
    expect(await docs.capture(["--affected"])).toBe(UI_CAPTURE_EXIT.pass)
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
    expect(await h.capture(["--affected"])).toBe(UI_CAPTURE_EXIT.pass)
    expect(h.suites[0]?.env[FLOW_SUITE_ENV.flows]).toBe("tasks,shell")
    expect((await h.report()).selection?.unmapped).toEqual(["packages/std/src/result.ts"])
  })

  it("exits with the harness code when the affected base cannot be found", async () => {
    const h = harness()
    expect(await h.capture(["--affected"], { affectedBase: "upstream/main" })).toBe(
      UI_CAPTURE_EXIT.harness,
    )
    expect(h.lines[0]).toContain('"upstream/main"')
  })

  describe("--docs", () => {
    const docsFlows = [
      defineFlow({
        name: "tasks",
        checkpoints: [
          { name: "board", act: async () => {}, ready, docs: "tasks-board" },
          { name: "dialog", act: async () => {}, ready, docs: "new-task" },
        ],
      }),
      defineFlow({ name: "shell", checkpoints: [{ name: "home", act: async () => {}, ready }] }),
    ]
    const docsHarness = (flowsOverride: readonly Flow[] = docsFlows) => {
      const h = harness({ flows: flowsOverride })
      h.scenario.modes = ["light", "dark"]
      return h
    }
    const docsDir = "/docs"
    const docsPngs = (h: ReturnType<typeof harness>) =>
      [...h.store.files.keys()].filter((path) => path.startsWith(`${docsDir}/`)).sort()

    it("captures only the docs flows and copies each marked desktop frame in light and dark", async () => {
      const h = docsHarness()
      expect(await h.capture(["--docs"], { docsDir })).toBe(UI_CAPTURE_EXIT.pass)
      expect(h.suites).toHaveLength(1)
      expect(h.suites[0]?.env).toMatchObject({
        [FLOW_SUITE_ENV.flows]: "tasks",
        [FLOW_SUITE_ENV.preset]: "quick",
        [FLOW_SUITE_ENV.mode]: "capture",
      })
      expect((await h.report()).selection).toMatchObject({
        by: "docs",
        flows: [{ name: "tasks", reasons: ["marks docs images tasks-board, new-task"] }],
      })
      expect(docsPngs(h)).toEqual([
        "/docs/new-task-dark.png",
        "/docs/new-task-light.png",
        "/docs/tasks-board-dark.png",
        "/docs/tasks-board-light.png",
      ])
      const run = h.suites[0]?.env[FLOW_RUN_ENV] ?? ""
      const frame = (checkpoint: string, mode: string) =>
        h.store.files.get(`${run}/flows/tasks/desktop/${checkpoint}/${mode}.png`)
      expect(h.store.files.get("/docs/tasks-board-light.png")).toEqual(frame("01-board", "light"))
      expect(h.store.files.get("/docs/tasks-board-dark.png")).toEqual(frame("01-board", "dark"))
      expect(h.store.files.get("/docs/new-task-dark.png")).toEqual(frame("02-dialog", "dark"))
      expect(frame("01-board", "light")).not.toEqual(frame("01-board", "dark"))
      expect(h.lines).toContain(
        "Docs images written to /docs: new-task-dark.png, new-task-light.png, tasks-board-dark.png, tasks-board-light.png.",
      )
    })

    it("removes the PNGs no checkpoint names any more, and leaves other files alone", async () => {
      const h = docsHarness()
      await h.store.write("/docs/old-shot-light.png", png(0))
      await h.store.write("/docs/tasks-board-light.png", png(0))
      await h.store.write("/docs/README.md", "# Images\n")
      expect(await h.capture(["--docs"], { docsDir })).toBe(UI_CAPTURE_EXIT.pass)
      expect(h.store.files.has("/docs/old-shot-light.png")).toBe(false)
      expect(h.store.files.get("/docs/tasks-board-light.png")).not.toEqual(png(0))
      expect(h.store.files.has("/docs/README.md")).toBe(true)
      expect(h.lines).toContain("Docs images removed from /docs: old-shot-light.png.")
    })

    it("fails and writes nothing when a docs flow breaks", async () => {
      const h = docsHarness()
      await h.store.write("/docs/old-shot-light.png", png(0))
      h.scenario.status = "fail"
      expect(await h.capture(["--docs"], { docsDir })).toBe(UI_CAPTURE_EXIT.fail)
      expect(docsPngs(h)).toEqual(["/docs/old-shot-light.png"])
      expect(h.lines).toContain("Docs images not written: a docs flow broke.")
    })

    it("exits with the harness code and writes nothing when a marked frame is missing", async () => {
      const h = docsHarness()
      h.scenario.modes = ["light"]
      expect(await h.capture(["--docs"], { docsDir })).toBe(UI_CAPTURE_EXIT.harness)
      expect(docsPngs(h)).toEqual([])
      expect(h.lines.at(-1)).toContain('no desktop dark frame for docs image "tasks-board"')
    })

    it("rejects two checkpoints with one docs name, a missing docs dir, and no marked checkpoint", async () => {
      const twice = docsHarness([
        docsFlows[0] as Flow,
        defineFlow({
          name: "shell",
          checkpoints: [{ name: "home", act: async () => {}, ready, docs: "new-task" }],
        }),
      ])
      expect(await twice.capture(["--docs"], { docsDir })).toBe(UI_CAPTURE_EXIT.harness)
      expect(twice.lines[0]).toContain('"new-task" names a docs image in both')

      const noDir = docsHarness()
      expect(await noDir.capture(["--docs"])).toBe(UI_CAPTURE_EXIT.harness)
      expect(noDir.lines[0]).toContain("docsDir")

      const unmarked = docsHarness(flows)
      expect(await unmarked.capture(["--docs"], { docsDir })).toBe(UI_CAPTURE_EXIT.harness)
      expect(unmarked.lines[0]).toContain("No checkpoint marks a docs image")

      for (const h of [twice, noDir, unmarked]) expect(h.suites).toHaveLength(0)
    })
  })

  it("prints usage for help, and hands serve to the runtime", async () => {
    const h = harness()
    expect(await h.capture(["--help"])).toBe(UI_CAPTURE_EXIT.pass)
    expect(h.lines[0]).toContain("Usage: ui:capture")
    expect(await h.capture(["serve"])).toBe(UI_CAPTURE_EXIT.pass)
    expect(h.lines).toContain("serving:capture")
    expect(await h.capture(["serve", "--explore"])).toBe(UI_CAPTURE_EXIT.pass)
    expect(h.lines).toContain("serving:explore")
  })
})
