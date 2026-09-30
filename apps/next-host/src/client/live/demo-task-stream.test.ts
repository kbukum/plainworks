import { describe, expect, it } from "vitest"
import { demoTaskFrame } from "./demo-task-stream"

describe("demoTaskFrame", () => {
  it("sends a task upsert whose payload carries an id and a numbered title", () => {
    const frame = demoTaskFrame(7)
    expect(frame.type).toBe("task.upserted")
    expect(JSON.parse(frame.data)).toEqual({ id: "live-2", title: "Triage inbound issues #7" })
  })

  it("reuses a slot id once the titles wrap, so redelivery updates the same task", () => {
    expect(JSON.parse(demoTaskFrame(1).data).id).toBe(JSON.parse(demoTaskFrame(6).data).id)
  })
})
