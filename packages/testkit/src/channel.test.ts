import type { StreamFrame, StreamTransportContext, WebAbortSignal } from "@plainworks/std"
import { describe, expect, test } from "vitest"
import { fakeStreamTransport } from "./channel"

/** A collecting context: records the callbacks the stream consumer would observe. */
function collectingContext(signal: WebAbortSignal, lastEventId?: string) {
  const opened: boolean[] = []
  const frames: StreamFrame[] = []
  const ids: string[] = []
  const context: StreamTransportContext = {
    headers: {},
    signal,
    lastEventId,
    onOpen: () => opened.push(true),
    onFrame: (frame) => frames.push(frame),
    onId: (id) => ids.push(id),
  }
  return { context, opened, frames, ids }
}

describe("fakeStreamTransport", () => {
  test("records each open() as an ordered attempt and exposes the current one", () => {
    const fake = fakeStreamTransport()
    expect(fake.current).toBeUndefined()
    expect(fake.attempts).toHaveLength(0)

    const transport = fake.factory()
    void transport.open(collectingContext(new AbortController().signal).context)

    expect(fake.attempts).toHaveLength(1)
    expect(fake.current).toBe(fake.attempts[0])
  })

  test("drives onOpen and delivers frames in order", () => {
    const fake = fakeStreamTransport()
    const { context, opened, frames } = collectingContext(new AbortController().signal)
    void fake.factory().open(context)

    const attempt = fake.current
    attempt?.open()
    attempt?.frame({ type: "message", data: "a" })
    attempt?.frame({ type: "message", data: "b" })

    expect(opened).toEqual([true])
    expect(frames.map((f) => f.data)).toEqual(["a", "b"])
  })

  test("endOk resolves the attempt and endError rejects it (a mid-stream drop)", async () => {
    const fake = fakeStreamTransport()
    const ok = fake.factory().open(collectingContext(new AbortController().signal).context)
    fake.current?.endOk()
    await expect(ok).resolves.toBeUndefined()
    expect(fake.current?.settled).toBe(true)

    const drop = fake.factory().open(collectingContext(new AbortController().signal).context)
    fake.current?.endError(new Error("dropped"))
    await expect(drop).rejects.toThrow("dropped")
  })

  test("a reconnect attempt carries the resume cursor the consumer supplies", () => {
    const fake = fakeStreamTransport()
    void fake.factory().open(collectingContext(new AbortController().signal).context)
    void fake.factory().open(collectingContext(new AbortController().signal, "42").context)

    expect(fake.attempts).toHaveLength(2)
    expect(fake.attempts[1]?.context.lastEventId).toBe("42")
  })

  test("an aborted signal rejects open() with an AbortError and detaches its listener", async () => {
    const fake = fakeStreamTransport()
    const controller = new AbortController()
    const pending = fake.factory().open(collectingContext(controller.signal).context)
    controller.abort(new Error("closed"))

    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(fake.current?.aborted).toBe(true)
  })

  test("assertClosed throws while an attempt is live and passes once it settles", async () => {
    const fake = fakeStreamTransport()
    const pending = fake.factory().open(collectingContext(new AbortController().signal).context)
    fake.current?.open()

    expect(() => fake.assertClosed()).toThrow(/left open/)

    fake.current?.endOk()
    await pending
    expect(() => fake.assertClosed()).not.toThrow()
  })

  test("assertClosed passes when a live attempt is torn down by an abort", async () => {
    const fake = fakeStreamTransport()
    const controller = new AbortController()
    const pending = fake.factory().open(collectingContext(controller.signal).context)
    fake.current?.open()
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(() => fake.assertClosed()).not.toThrow()
  })

  test("open() and frame() after the attempt settles fail loudly", async () => {
    const fake = fakeStreamTransport()
    const { frames } = collectingContext(new AbortController().signal)
    const context = collectingContext(new AbortController().signal)
    const pending = fake.factory().open(context.context)
    const attempt = fake.current
    attempt?.endOk()
    await pending

    // A real transport emits nothing after EOF; driving a settled attempt is a test bug.
    expect(() => attempt?.frame({ type: "message", data: "late" })).toThrow(
      /after the attempt settled/,
    )
    expect(() => attempt?.open()).toThrow(/after the attempt settled/)
    expect(context.frames).toEqual(frames)
  })
})
