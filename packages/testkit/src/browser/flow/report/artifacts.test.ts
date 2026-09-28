import { describe, expect, it } from "vitest"
import { FlowError } from "../errors"
import {
  type ArtifactStore,
  finishFlowRun,
  flowArtifactPaths,
  openFlowRun,
  startFlowRun,
} from "./artifacts"
import type { FlowDeviceReport } from "./schema"

/** An in-memory store: files by path, directories implied by their contents. */
function memoryStore() {
  const files = new Map<string, string | Uint8Array>()
  const dirs = new Set<string>()
  const links = new Map<string, string>()
  const under = (path: string) => [...files.keys()].filter((file) => file.startsWith(`${path}/`))
  const store: ArtifactStore = {
    async createDir(path) {
      if (dirs.has(path)) return false
      dirs.add(path)
      return true
    },
    async write(path, data) {
      files.set(path, data)
    },
    async read(path) {
      const data = files.get(path)
      if (data === undefined) throw new Error(`ENOENT ${path}`)
      return typeof data === "string" ? data : new TextDecoder().decode(data)
    },
    async list(path) {
      const names = new Set<string>()
      for (const entry of [...dirs, ...files.keys()]) {
        if (entry.startsWith(`${path}/`))
          names.add(entry.slice(path.length + 1).split("/")[0] ?? "")
      }
      return [...names].sort()
    },
    async size(path) {
      return under(path).reduce((total, file) => {
        const data = files.get(file)
        return total + (typeof data === "string" ? data.length : (data?.byteLength ?? 0))
      }, 0)
    },
    async remove(path) {
      for (const file of under(path)) files.delete(file)
      for (const dir of [...dirs]) if (dir === path || dir.startsWith(`${path}/`)) dirs.delete(dir)
    },
    async link(target, path) {
      links.set(path, target)
    },
  }
  return { store, files, dirs, links }
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
    expect(flowArtifactPaths.entry("create-task", "mobile")).toBe(
      "entries/create-task--mobile.json",
    )
  })
})

describe("flow runs", () => {
  it("starts a run in a time-ordered directory and never reuses one", async () => {
    const { store } = memoryStore()
    const first = await startFlowRun({ root: "/art", now: () => NOW, store })
    const second = await startFlowRun({ root: "/art", now: () => NOW, store })
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
    const run = await startFlowRun({ root: "/art", now: () => NOW, store })
    const writer = openFlowRun(run.dir, store)
    await writer.write(
      flowArtifactPaths.entry("b-flow", "desktop"),
      JSON.stringify(entry("b-flow", "desktop")),
    )
    await writer.write(
      flowArtifactPaths.entry("a-flow", "mobile"),
      JSON.stringify(entry("a-flow", "mobile")),
    )

    const report = await finishFlowRun({ root: "/art", run, now: () => NOW, store })
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

  it("rejects a malformed entry instead of merging it", async () => {
    const { store } = memoryStore()
    const run = await startFlowRun({ root: "/art", now: () => NOW, store })
    await openFlowRun(run.dir, store).write("entries/x--desktop.json", '{"flow": 1}')
    await expect(finishFlowRun({ root: "/art", run, now: () => NOW, store })).rejects.toMatchObject(
      {
        kind: "flow/report",
      },
    )
  })

  it("prunes old runs past the retention policy, keeping the one just finished", async () => {
    const { store, dirs } = memoryStore()
    const runs = []
    for (let minute = 0; minute < 4; minute++) {
      const run = await startFlowRun({ root: "/art", now: () => NOW + minute * 60_000, store })
      await openFlowRun(run.dir, store).write("flows/f/desktop/01-a/v.png", "x".repeat(10))
      runs.push(run)
    }
    const last = runs.at(-1)
    if (last === undefined) throw new Error("no run")
    await finishFlowRun({
      root: "/art",
      run: last,
      now: () => NOW,
      store,
      retention: { keepRuns: 2, maxBytes: 1_000_000 },
    })
    expect(await store.list("/art/runs")).toEqual([runs[2]?.id, runs[3]?.id])
    expect(dirs.has(`${runs[0]?.dir}`)).toBe(false)
  })
})
