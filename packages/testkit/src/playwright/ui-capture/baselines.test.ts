import type { Locator, Page } from "@playwright/test"
import { describe, expect, it } from "vitest"
import { defineFlow } from "../flow/definition"
import { memoryArtifactStore } from "../flow/report/memory-store"
import {
  baseCacheKey,
  evictBases,
  planBaseEviction,
  readStoredReport,
  recordBaseUse,
  saveSnapshot,
  uiCapturePaths,
} from "./baselines"

const main = (page: Page) => page.locator("main")
const nav = (page: Page) => page.getByRole("navigation")
const flow = (ready: (page: Page) => Locator) =>
  defineFlow({ name: "tasks", checkpoints: [{ name: "board", act: async () => {}, ready }] })

const report = {
  schemaVersion: 1,
  runId: "r1",
  createdAt: "2026-01-15T12:00:00.000Z",
  summary: {},
  runs: [],
}

describe("baseCacheKey", () => {
  it("is stable for the same commit, flows, and preset", () => {
    const key = baseCacheKey({ commit: "0123456789abcdef", flows: [flow(main)], preset: "quick" })
    expect(key).toMatch(/^0123456789ab-[0-9a-f]{12}-quick$/)
    expect(baseCacheKey({ commit: "0123456789abcdef", flows: [flow(main)], preset: "quick" })).toBe(
      key,
    )
  })

  it("changes when a flow's steps change, since the base replays the current flows", () => {
    const a = baseCacheKey({ commit: "0123456789abcdef", flows: [flow(main)], preset: "quick" })
    const b = baseCacheKey({ commit: "0123456789abcdef", flows: [flow(nav)], preset: "quick" })
    const c = baseCacheKey({ commit: "0123456789abcdef", flows: [flow(main)], preset: "themes" })
    expect(new Set([a, b, c]).size).toBe(3)
  })
})

describe("planBaseEviction", () => {
  it("keeps the most recently used bases and the one in use", () => {
    const entries = [
      { key: "a", usedAt: 1 },
      { key: "b", usedAt: 5 },
      { key: "c", usedAt: 3 },
      { key: "d", usedAt: 4 },
      { key: "e", usedAt: 2 },
    ]
    expect(planBaseEviction(entries, 3).sort()).toEqual(["a", "e"])
    expect(planBaseEviction(entries, 3, "a").sort()).toEqual(["c", "e"])
    expect(planBaseEviction(entries.slice(0, 2), 3)).toEqual([])
  })
})

describe("stored runs", () => {
  it("reads a stored report, or nothing when the run never finished", async () => {
    const store = memoryArtifactStore()
    await store.write("/ui/bases/k/report.json", JSON.stringify(report))
    expect(await readStoredReport(store, "/ui/bases/k")).toMatchObject({ runId: "r1" })
    expect(await readStoredReport(store, "/ui/bases/none")).toBeUndefined()
  })

  it("saves a run as a named snapshot, replacing an older one", async () => {
    const store = memoryArtifactStore()
    await store.write("/ui/runs/r1/report.json", JSON.stringify(report))
    await store.write("/ui/snapshots/before/stale.png", "old")
    const dir = await saveSnapshot(store, "/ui", { id: "r1", dir: "/ui/runs/r1" }, "before")
    expect(dir).toBe(uiCapturePaths.snapshot("/ui", "before"))
    expect([...store.files.keys()].filter((path) => path.startsWith("/ui/snapshots"))).toEqual([
      "/ui/snapshots/before/report.json",
    ])
  })

  it("records each base's use and evicts the least recently used beyond the limit", async () => {
    const store = memoryArtifactStore()
    for (const [key, at] of [
      ["a", 1],
      ["b", 2],
      ["c", 3],
      ["d", 4],
    ] as const) {
      await store.write(`/ui/bases/${key}/report.json`, JSON.stringify(report))
      await recordBaseUse(store, `/ui/bases/${key}`, { commit: key, ref: "main", usedAt: at })
    }
    await store.write("/ui/bases/broken/report.json", "{}")
    await recordBaseUse(store, "/ui/bases/a", { commit: "a", ref: "main", usedAt: 10 })
    expect(await evictBases(store, "/ui", { keep: 3, inUse: "a" })).toEqual(["b", "broken"])
    expect(await store.list("/ui/bases")).toEqual(["a", "c", "d"])
  })
})
