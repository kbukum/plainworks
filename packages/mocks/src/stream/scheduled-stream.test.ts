import { AbortError, type Delay } from "@plainworks/std/resilience"
import type { StreamFrame, StreamTransportContext } from "@plainworks/std/seam"
import { describe, expect, it, vi } from "vitest"
import { createScheduledStream } from "./scheduled-stream"

// A manual delay: each call parks until the test releases it, and rejects when its signal aborts.
function manualDelay() {
  const pending: Array<{ ms: number; resolve: () => void }> = []
  const delay: Delay = (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new AbortError({ cause: signal.reason }))
        return
      }
      pending.push({ ms, resolve })
      signal?.addEventListener("abort", () => reject(new AbortError({ cause: signal.reason })), {
        once: true,
      })
    })
  const tick = async (): Promise<void> => {
    pending.shift()?.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }
  return { delay, pending, tick }
}

function contextFor(controller: AbortController, frames: StreamFrame[]) {
  const onOpen = vi.fn()
  const context: StreamTransportContext = {
    headers: {},
    signal: controller.signal,
    onOpen,
    onFrame: (frame) => frames.push(frame),
  }
  return { context, onOpen }
}

describe("createScheduledStream", () => {
  it("uses canonical cursors across attempts and resets before a resumed boundary", async () => {
    const epoch = "00000000000000000000000000000001"
    const { delay, tick } = manualDelay()
    const factory = createScheduledStream({
      epoch,
      intervalMs: 1,
      delay,
      frame: () => ({ type: "event", data: "{}" }),
    })
    const first = new AbortController()
    const frames: StreamFrame[] = []
    const opened = factory().open(contextFor(first, frames).context)
    await tick()
    expect(frames[0]).toEqual({
      type: "connected",
      data: JSON.stringify({ epoch, cursor: `${epoch}:0` }),
    })
    expect(frames[1]?.id).toBe(`${epoch}:1`)
    first.abort()
    await expect(opened).rejects.toBeInstanceOf(AbortError)
    const second = new AbortController()
    const resumed: StreamFrame[] = []
    const running = factory().open({
      ...contextFor(second, resumed).context,
      lastEventId: `${epoch}:1`,
    })
    expect(resumed.map(({ type }) => type)).toEqual(["reset", "connected"])
    expect(resumed.every(({ id }) => id === undefined)).toBe(true)
    expect(JSON.parse(resumed[0]?.data ?? "")).toEqual({
      reason: "replayExpired",
      cursor: `${epoch}:1`,
    })
    second.abort()
    await expect(running).rejects.toBeInstanceOf(AbortError)
  })

  it("may skip a tick without inventing an application event", async () => {
    const { delay, tick } = manualDelay()
    const controller = new AbortController()
    const frames: StreamFrame[] = []
    const opened = createScheduledStream({
      intervalMs: 1,
      delay,
      frame: (seq) => (seq === 1 ? undefined : { type: "event", data: "{}" }),
    })().open(contextFor(controller, frames).context)
    await tick()
    expect(frames).toEqual([])
    await tick()
    expect(frames[0]?.id).toBe("2")
    controller.abort()
    await expect(opened).rejects.toBeInstanceOf(AbortError)
  })

  it("opens, then emits one numbered frame per interval", async () => {
    const { delay, pending, tick } = manualDelay()
    const controller = new AbortController()
    const frames: StreamFrame[] = []
    const { context, onOpen } = contextFor(controller, frames)
    const factory = createScheduledStream({
      intervalMs: 500,
      frame: (seq) => ({ type: "tick", data: String(seq) }),
      delay,
    })

    const opened = factory().open(context)
    expect(onOpen).toHaveBeenCalledOnce()
    await Promise.resolve()
    expect(pending[0]?.ms).toBe(500)
    expect(frames).toEqual([])

    await tick()
    await tick()
    expect(frames).toEqual([
      { type: "tick", data: "1", id: "1" },
      { type: "tick", data: "2", id: "2" },
    ])

    controller.abort("done")
    await expect(opened).rejects.toBeInstanceOf(AbortError)
  })

  it("keeps an id the frame factory chose", async () => {
    const { delay, tick } = manualDelay()
    const controller = new AbortController()
    const frames: StreamFrame[] = []
    const opened = createScheduledStream({
      intervalMs: 1,
      frame: () => ({ type: "tick", data: "{}", id: "custom" }),
      delay,
    })().open(contextFor(controller, frames).context)

    await Promise.resolve()
    await tick()
    expect(frames[0]?.id).toBe("custom")
    controller.abort()
    await expect(opened).rejects.toBeInstanceOf(AbortError)
  })

  it("stops emitting once aborted", async () => {
    const { delay, tick } = manualDelay()
    const controller = new AbortController()
    const frames: StreamFrame[] = []
    const opened = createScheduledStream({
      intervalMs: 10,
      frame: (seq) => ({ type: "tick", data: String(seq) }),
      delay,
    })().open(contextFor(controller, frames).context)

    await Promise.resolve()
    controller.abort("closed")
    await expect(opened).rejects.toMatchObject({ cause: "closed" })
    await tick()
    expect(frames).toEqual([])
  })

  it("stops after an abort even when the delay resolves at once", async () => {
    const controller = new AbortController()
    const frames: StreamFrame[] = []
    const { context } = contextFor(controller, frames)
    const opened = createScheduledStream({
      intervalMs: 10,
      frame: (seq) => ({ type: "tick", data: String(seq) }),
      delay: () => Promise.resolve(),
    })().open({
      ...context,
      onFrame: (frame) => {
        frames.push(frame)
        if (frames.length === 3) controller.abort("closed")
      },
    })

    await expect(opened).rejects.toMatchObject({ cause: "closed" })
    expect(frames.map((frame) => frame.id)).toEqual(["1", "2", "3"])
  })

  it("rejects without opening when the signal is already aborted", async () => {
    const controller = new AbortController()
    controller.abort("early")
    const { context, onOpen } = contextFor(controller, [])

    await expect(
      createScheduledStream({ intervalMs: 10, frame: () => ({ type: "t", data: "" }) })().open(
        context,
      ),
    ).rejects.toBeInstanceOf(AbortError)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it("emits on the host timer by default", async () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      const frames: StreamFrame[] = []
      const opened = createScheduledStream({
        intervalMs: 1_000,
        frame: (seq) => ({ type: "tick", data: String(seq) }),
      })().open(contextFor(controller, frames).context)

      await vi.advanceTimersByTimeAsync(2_000)
      expect(frames.map((frame) => frame.data)).toEqual(["1", "2"])
      controller.abort()
      await expect(opened).rejects.toBeInstanceOf(AbortError)
    } finally {
      vi.useRealTimers()
    }
  })

  it("fails the attempt when the frame factory throws", async () => {
    const { delay, tick } = manualDelay()
    const controller = new AbortController()
    const failure = new Error("bad payload")
    const opened = createScheduledStream({
      intervalMs: 10,
      frame: () => {
        throw failure
      },
      delay,
    })().open(contextFor(controller, []).context)

    await Promise.resolve()
    await tick()
    await expect(opened).rejects.toBe(failure)
  })

  it("rejects an invalid interval when built", () => {
    const frame = () => ({ type: "t", data: "" })
    expect(() => createScheduledStream({ intervalMs: -1, frame })).toThrow(RangeError)
    expect(() => createScheduledStream({ intervalMs: Number.NaN, frame })).toThrow(RangeError)
  })
})
