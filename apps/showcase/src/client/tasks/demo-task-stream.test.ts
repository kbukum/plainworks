import { fixedClock } from "@plainworks/std/time"
import { describe, expect, it } from "vitest"
import { isTask } from "../../neutral/tasks"
import { demoTaskFrame } from "./demo-task-stream"
import { LIVE_EVENT } from "./live-tasks"

describe("demoTaskFrame", () => {
  it("carries a valid task upsert stamped by the clock", () => {
    const frame = demoTaskFrame(3, fixedClock("2026-01-15T12:00:00.000Z"))
    const task: unknown = JSON.parse(frame.data)

    expect(frame.type).toBe(LIVE_EVENT)
    expect(isTask(task)).toBe(true)
    expect(task).toMatchObject({ id: "live-3", updatedAt: "2026-01-15T12:00:00.000Z" })
  })

  it("reuses a slot id so redelivery upserts the same row", () => {
    const ids = [1, 6].map((seq) => (JSON.parse(demoTaskFrame(seq).data) as { id: string }).id)
    expect(ids[0]).toBe(ids[1])
  })
})
