import { fixedClock } from "@plainworks/std/time"
import { describe, expect, it } from "vitest"
import { FlowError } from "../errors"
import {
  collectFlowRun,
  flowArtifactPaths,
  openFlowRun,
  publishFlowRun,
  startFlowRun,
} from "./artifacts"
import { memoryArtifactStore } from "./memory-store"
import type { RetentionPolicy } from "./retention"
import type { FlowDeviceReport } from "./schema"

function memoryStore() {
  const store = memoryArtifactStore()
  return { store, files: store.files, dirs: store.dirs, links: store.links }
}

/** Collect and publish a run, the way a run's owner finishes it. */
async function finish(
  options: Parameters<typeof collectFlowRun>[0] & {
    readonly root: string
    readonly retention?: RetentionPolicy
  },
) {
  const report = await collectFlowRun(options)
  await publishFlowRun({ ...options, report })
  return report
}

const entry = (flow: string, device: FlowDeviceReport["device"]): FlowDeviceReport => ({
  flow,
  device,
  mode: "capture",
  status: "pass",
  checkpoints: [],
})

const NOW = Date.parse("2026-01-15T12:00:00.000Z")

describe("flowArtifactPaths", () => {
  it("lays a flow's files out by flow, device, numbered checkpoint, and variant", () => {
    const at = { flow: "create-task", device: "mobile", index: 1, checkpoint: "new-task" } as const
    expect(flowArtifactPaths.variant(at, "dark.indigo.compact.standard", "png")).toBe(
      "flows/create-task/mobile/02-new-task/dark.indigo.compact.standard.png",
    )
    expect(flowArtifactPaths.review(at, "light.default.default.standard", "diff.png")).toBe(
      "review/create-task/mobile/02-new-task/light.default.default.standard.diff.png",
    )
    expect(flowArtifactPaths.sheet(at)).toBe("sheets/create-task--mobile--02-new-task.html")
    expect(flowArtifactPaths.entry("create-task", "mobile")).toBe(
      "entries/create-task--mobile.json",
    )
  })
})

describe("flow runs", () => {
  it("starts a run in a time-ordered directory and never reuses one", async () => {
    const { store } = memoryStore()
    const first = await startFlowRun({ root: "/art", clock: fixedClock(NOW), store })
    const second = await startFlowRun({ root: "/art", clock: fixedClock(NOW), store })
    expect(first.id).toBe("2026-01-15T12-00-00-000Z")
    expect(first.dir).toBe("/art/runs/2026-01-15T12-00-00-000Z")
    expect(second.id).toBe("2026-01-15T12-00-00-000Z-1")
  })

  it("writes inside the run only, refusing a path that climbs out", async () => {
    const { store, files } = memoryStore()
    const run = openFlowRun("/art/runs/r1", store)
    expect(await run.write("flows/a/desktop/01-x/v.png", Uint8Array.of(1))).toBe(
      "flows/a/desktop/01-x/v.png",
    )
    expect(files.has("/art/runs/r1/flows/a/desktop/01-x/v.png")).toBe(true)
    await expect(run.write("../../etc/passwd", "x")).rejects.toThrow(FlowError)
    await expect(run.write("/etc/passwd", "x")).rejects.toThrow(FlowError)
    await expect(run.write("flows/../../out", "x")).rejects.toThrow(FlowError)
    await expect(run.write("..\\..\\outside", "x")).rejects.toThrow(FlowError)
    await expect(run.write("flows\\a.png", "x")).rejects.toThrow(FlowError)
    expect(await run.write("flows/..hidden/v.png", "x")).toBe("flows/..hidden/v.png")
  })

  it("merges every entry into report.json and report.md, and points latest at the run", async () => {
    const { store, files, links } = memoryStore()
    const run = await startFlowRun({ root: "/art", clock: fixedClock(NOW), store })
    const writer = openFlowRun(run.dir, store)
    await writer.write(
      flowArtifactPaths.entry("b-flow", "desktop"),
      JSON.stringify(entry("b-flow", "desktop")),
    )
    await writer.write(
      flowArtifactPaths.entry("a-flow", "mobile"),
      JSON.stringify(entry("a-flow", "mobile")),
    )

    const report = await finish({ root: "/art", run, clock: fixedClock(NOW), store })
    expect(report).toMatchObject({
      schemaVersion: 1,
      runId: run.id,
      summary: { verdict: "pass", runs: 2 },
    })
    expect(report.runs.map((item) => item.flow)).toEqual(["a-flow", "b-flow"])
    expect(JSON.parse(await store.read(`${run.dir}/report.json`))).toEqual(report)
    expect(files.get(`${run.dir}/report.md`)).toContain("**Verdict: pass**")
    expect(links.get("/art/latest")).toBe(`runs/${run.id}`)
  })

  it("collects without writing, so the owner can add to the report before publishing", async () => {
    const { store, files } = memoryStore()
    const run = await startFlowRun({ root: "/art", clock: fixedClock(NOW), store })
    const report = await collectFlowRun({ run, clock: fixedClock(NOW), store })
    expect(report.runs).toEqual([])
    expect(files.has(`${run.dir}/report.json`)).toBe(false)
    await publishFlowRun({
      root: "/art",
      run,
      report: { ...report, review: { status: "skipped", reason: "no base" } },
      store,
    })
    expect(JSON.parse(await store.read(`${run.dir}/report.json`)).review.reason).toBe("no base")
  })

  it("rejects a malformed entry instead of merging it", async () => {
    const { store } = memoryStore()
    const run = await startFlowRun({ root: "/art", clock: fixedClock(NOW), store })
    await openFlowRun(run.dir, store).write("entries/x--desktop.json", '{"flow": 1}')
    await expect(
      finish({ root: "/art", run, clock: fixedClock(NOW), store }),
    ).rejects.toMatchObject({
      kind: "flow/report",
    })
  })

  it("prunes old runs past the retention policy, keeping the one just finished", async () => {
    const { store, dirs } = memoryStore()
    const runs = []
    for (let minute = 0; minute < 4; minute++) {
      const run = await startFlowRun({
        root: "/art",
        clock: fixedClock(NOW + minute * 60_000),
        store,
      })
      await openFlowRun(run.dir, store).write("flows/f/desktop/01-a/v.png", "x".repeat(10))
      runs.push(run)
    }
    const last = runs.at(-1)
    if (last === undefined) throw new Error("no run")
    await finish({
      root: "/art",
      run: last,
      clock: fixedClock(NOW),
      store,
      retention: { keepRuns: 2, maxBytes: 1_000_000 },
    })
    expect(await store.list("/art/runs")).toEqual([runs[2]?.id, runs[3]?.id])
    expect(dirs.has(`${runs[0]?.dir}`)).toBe(false)
  })
})
