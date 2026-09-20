import type { StreamFrame, StreamTransportContext } from "@plainworks/std"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createDemoTaskStream } from "./demo-task-stream"

afterEach(() => {
  vi.useRealTimers()
})

describe("createDemoTaskStream", () => {
  it("emits on its interval and stops when aborted", async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const frames: StreamFrame[] = []
    const onOpen = vi.fn()
    const context: StreamTransportContext = {
      headers: {},
      signal: controller.signal,
      onOpen,
      onFrame: (frame) => frames.push(frame),
    }

    const opened = createDemoTaskStream(1_000)().open(context)
    expect(onOpen).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(frames).toHaveLength(1)
    expect(frames[0]?.type).toBe("task.upserted")
    expect(() => JSON.parse(frames[0]?.data ?? "")).not.toThrow()

    controller.abort("test complete")
    await expect(opened).rejects.toMatchObject({ name: "AbortError" })
    await vi.advanceTimersByTimeAsync(2_000)
    expect(frames).toHaveLength(1)
  })
})
