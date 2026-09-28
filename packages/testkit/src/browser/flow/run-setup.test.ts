import { describe, expect, it } from "vitest"
import { FLOW_RUN_ENV } from "./report/artifacts"
import { memoryArtifactStore } from "./report/memory-store"
import { setupFlowRun } from "./run-setup"

const entry = { flow: "tasks", device: "desktop", mode: "assert", status: "pass", checkpoints: [] }

describe("setupFlowRun", () => {
  it("starts a run, publishes it to the workers, and reports it on teardown", async () => {
    const store = memoryArtifactStore()
    const env: Record<string, string | undefined> = {}
    const teardown = await setupFlowRun({ root: "/art", env, store })
    const dir = env[FLOW_RUN_ENV]
    expect(dir).toMatch(/^\/art\/runs\//)
    await store.write(`${dir}/entries/tasks--desktop.json`, JSON.stringify(entry))
    await teardown()
    expect(store.files.has(`${dir}/report.json`)).toBe(true)
    expect(store.links.get("/art/latest")).toMatch(/^runs\//)
  })

  it("leaves a run another caller owns alone", async () => {
    const store = memoryArtifactStore()
    const env = { [FLOW_RUN_ENV]: "/art/runs/owned" }
    const teardown = await setupFlowRun({ root: "/art", env, store })
    await teardown()
    expect(env[FLOW_RUN_ENV]).toBe("/art/runs/owned")
    expect(store.files.size).toBe(0)
    expect(store.dirs.size).toBe(0)
  })

  it("removes a run no flow wrote to, so a suite of other specs leaves nothing behind", async () => {
    const store = memoryArtifactStore()
    const env: Record<string, string | undefined> = {}
    const teardown = await setupFlowRun({ root: "/art", env, store })
    await teardown()
    expect(await store.list("/art/runs")).toEqual([])
    expect(store.links.size).toBe(0)
  })
})
