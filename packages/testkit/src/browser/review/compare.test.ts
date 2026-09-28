import { PNG } from "pngjs"
import { describe, expect, it } from "vitest"
import { openFlowRun } from "../flow/report/artifacts"
import { memoryArtifactStore } from "../flow/report/memory-store"
import type { FlowDeviceReport, FlowReport, VariantReport } from "../flow/report/schema"
import { summarizeFlowRuns } from "../flow/report/summary"
import { reviewChanges } from "./compare"

const WIDTH = 60
const HEIGHT = 30

/** A frame with a 24×24 dark block at `left`, or a blank frame. */
function frame(left?: number): Uint8Array {
  const image = new PNG({ width: WIDTH, height: HEIGHT })
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const dark = left !== undefined && x >= left && x < left + 24 && y < 24
      image.data.set(dark ? [20, 20, 20, 255] : [255, 255, 255, 255], (y * WIDTH + x) * 4)
    }
  }
  return new Uint8Array(PNG.sync.write(image))
}

const variant = (id: string, dir: string, capture = true): VariantReport => ({
  id,
  mode: "light",
  theme: "default",
  density: "default",
  preference: "standard",
  status: "pass",
  findings: [],
  allowed: [],
  ...(capture ? { frame: `${dir}/${id}.png`, aria: `${dir}/${id}.aria.yml` } : {}),
})

const run = (flow: string, variants: string[], capture = true): FlowDeviceReport => ({
  flow,
  device: "desktop",
  mode: capture ? "capture" : "assert",
  status: "pass",
  checkpoints: [
    {
      index: 0,
      name: "board",
      status: "pass",
      findings: [],
      allowed: [],
      variants: variants.map((id) => variant(id, `flows/${flow}/desktop/01-board`, capture)),
    },
  ],
})

const report = (runId: string, runs: FlowDeviceReport[]): FlowReport => ({
  schemaVersion: 1,
  runId,
  createdAt: "2026-01-15T12:00:00.000Z",
  summary: summarizeFlowRuns(runs),
  runs,
})

/** Store one variant's frame and ARIA tree in a run. */
async function put(
  store: ReturnType<typeof memoryArtifactStore>,
  dir: string,
  flow: string,
  id: string,
  png: Uint8Array,
  aria = "- main\n",
) {
  await store.write(`${dir}/flows/${flow}/desktop/01-board/${id}.png`, png)
  await store.write(`${dir}/flows/${flow}/desktop/01-board/${id}.aria.yml`, aria)
}

const BASE = { kind: "snapshot", name: "before" } as const

describe("reviewChanges", () => {
  it("classifies each frame against the base: unchanged, changed, added, removed", async () => {
    const store = memoryArtifactStore()
    const before = "/art/snapshots/before"
    const after = "/art/runs/r2"
    await put(store, before, "tasks", "light", frame(4))
    await put(store, before, "tasks", "dark", frame(4))
    await put(store, before, "tasks", "gone", frame())
    await put(store, before, "tasks", "renamed", frame(), '- main\n  - button "New"\n')
    await put(store, after, "tasks", "light", frame(4))
    await put(store, after, "tasks", "dark", frame(30))
    await put(store, after, "tasks", "fresh", frame())
    await put(store, after, "tasks", "renamed", frame(), '- main\n  - button "Add"\n')

    const review = await reviewChanges({
      base: {
        source: BASE,
        dir: before,
        report: report("r1", [run("tasks", ["light", "dark", "gone", "renamed"])]),
      },
      current: {
        dir: after,
        report: report("r2", [run("tasks", ["light", "dark", "fresh", "renamed"])]),
      },
      writer: openFlowRun(after, store),
      store,
    })

    expect(review).toMatchObject({
      status: "compared",
      base: { kind: "snapshot", name: "before", runId: "r1" },
      totals: { unchanged: 1, changed: 2, added: 1, removed: 1, "not-captured": 0 },
    })
    if (review.status !== "compared") throw new Error("not compared")
    const byVariant = Object.fromEntries(review.changes.map((change) => [change.variant, change]))
    expect(byVariant.dark).toMatchObject({
      status: "changed",
      ariaChanged: false,
      pixels: { sizeChanged: false, total: WIDTH * HEIGHT },
      before: "review/tasks/desktop/01-board/dark.before.png",
      after: "flows/tasks/desktop/01-board/dark.png",
      diff: "review/tasks/desktop/01-board/dark.diff.png",
    })
    expect(store.files.has(`${after}/review/tasks/desktop/01-board/dark.diff.png`)).toBe(true)
    expect(byVariant.renamed).toMatchObject({
      status: "changed",
      ariaChanged: true,
      ariaDiff: "review/tasks/desktop/01-board/renamed.aria.diff",
    })
    expect(byVariant.renamed?.diff).toBeUndefined()
    expect(await store.read(`${after}/review/tasks/desktop/01-board/renamed.aria.diff`)).toContain(
      '+   - button "Add"',
    )
    expect(byVariant.fresh).toMatchObject({
      status: "added",
      after: "flows/tasks/desktop/01-board/fresh.png",
    })
    expect(byVariant.gone).toMatchObject({
      status: "removed",
      before: "review/tasks/desktop/01-board/gone.before.png",
    })
    expect(byVariant.light).toBeUndefined()
  })

  it("counts base frames of a flow that errored or did not run as not captured, not removed", async () => {
    const store = memoryArtifactStore()
    const before = "/art/snapshots/before"
    const after = "/art/runs/r2"
    await put(store, before, "tasks", "light", frame(4))
    await put(store, before, "orders", "light", frame(4))
    await put(store, before, "users", "light", frame(4))
    await put(store, after, "tasks", "light", frame(4))
    const errored: FlowDeviceReport = {
      ...run("orders", [], true),
      status: "error",
      error: { kind: "readiness", message: "never ready" },
    }

    const review = await reviewChanges({
      base: {
        source: BASE,
        dir: before,
        report: report("r1", [
          run("tasks", ["light"]),
          run("orders", ["light"]),
          run("users", ["light"]),
        ]),
      },
      current: { dir: after, report: report("r2", [run("tasks", ["light"]), errored]) },
      writer: openFlowRun(after, store),
      store,
    })

    expect(review).toEqual({
      status: "compared",
      base: { kind: "snapshot", name: "before", runId: "r1" },
      totals: { unchanged: 1, changed: 0, added: 0, removed: 0, "not-captured": 2 },
      changes: [],
    })
  })

  it("skips the review when either run captured no frames", async () => {
    const store = memoryArtifactStore()
    const review = await reviewChanges({
      base: { source: BASE, dir: "/b", report: report("r1", [run("tasks", ["light"], false)]) },
      current: { dir: "/a", report: report("r2", [run("tasks", ["light"])]) },
      writer: openFlowRun("/a", store),
      store,
    })
    expect(review).toEqual({
      status: "skipped",
      reason: "The base run before (r1) captured no frames: save it with ui:check, which captures",
    })
  })

  it("stops when cancelled", async () => {
    const store = memoryArtifactStore()
    await put(store, "/b", "tasks", "light", frame(4))
    await put(store, "/a", "tasks", "light", frame(30))
    const controller = new AbortController()
    controller.abort()
    await expect(
      reviewChanges({
        base: { source: BASE, dir: "/b", report: report("r1", [run("tasks", ["light"])]) },
        current: { dir: "/a", report: report("r2", [run("tasks", ["light"])]) },
        writer: openFlowRun("/a", store),
        store,
        signal: controller.signal,
      }),
    ).rejects.toThrow()
  })
})
