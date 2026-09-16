import { describe, expect, test } from "vitest"
import type { StreamFrame, StreamTransport, StreamTransportContext } from "./stream"

// Downstream smoke: the stream-transport seam is the single source of truth every sse/ws adapter in
// `channel` satisfies structurally, and the shape a testkit transport double speaks.

describe("stream-transport seam", () => {
  test("a transport reports open, delivers frames, tracks the resume cursor, and ends cleanly", async () => {
    const opened: boolean[] = []
    const frames: StreamFrame[] = []
    const ids: string[] = []

    // A minimal in-memory transport: one attempt that opens, pushes a frame with a resume id, and
    // ends at clean EOF — the shape every real sse/ws adapter satisfies structurally.
    const transport: StreamTransport = {
      open(context) {
        context.onOpen()
        context.onFrame({ type: "message", data: "hello", id: "1" })
        context.onId?.("1")
        return Promise.resolve()
      },
    }
    const context: StreamTransportContext = {
      headers: { authorization: "******" },
      signal: new AbortController().signal,
      onOpen: () => opened.push(true),
      onFrame: (frame) => frames.push(frame),
      onId: (id) => ids.push(id),
    }

    await transport.open(context)

    expect(opened).toEqual([true])
    expect(frames).toEqual([{ type: "message", data: "hello", id: "1" }])
    expect(ids).toEqual(["1"])
  })

  test("a transport rejects when the attempt signal aborts", async () => {
    const transport: StreamTransport = {
      open(context) {
        return new Promise((_resolve, reject) => {
          context.signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          })
        })
      },
    }
    const controller = new AbortController()
    const context: StreamTransportContext = {
      headers: {},
      signal: controller.signal,
      onOpen: () => {},
      onFrame: () => {},
    }

    const pending = transport.open(context)
    controller.abort()
    await expect(pending).rejects.toThrow("aborted")
  })
})
