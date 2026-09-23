import type { Channel, ChannelOptions, ChannelStatus } from "@plainworks/channel"
import type { StreamFrame } from "@plainworks/std"
import { describe, expect, it, vi } from "vitest"
import { createDevtoolsSession } from "../../session"
import { type ChannelSourceOptions, createChannelSource } from "./channel-source"

interface FakeChannel extends Channel {
  push(frame: StreamFrame): void
}

function fakeChannel(status: ChannelStatus = "idle"): FakeChannel {
  let listener: ((frame: StreamFrame) => void) | undefined
  return {
    status,
    lastEventId: undefined,
    connect: () => {},
    close: () => {},
    on: () => ({ unsubscribe: () => {} }),
    onAny: (l: (frame: StreamFrame) => void) => {
      listener = l
      return { unsubscribe: () => (listener = undefined) }
    },
    push: (frame: StreamFrame) => listener?.(frame),
  } as unknown as FakeChannel
}

function frame(type: string, data = "", id?: string): StreamFrame {
  return id === undefined ? { type, data } : { type, data, id }
}

function setup(options: ChannelSourceOptions) {
  const session = createDevtoolsSession()
  const instrumentation = createChannelSource(options)
  session.registerSource(instrumentation.source)
  const port = session.connect()
  return { session, port, instrumentation }
}

function eventsOf(port: ReturnType<ReturnType<typeof createDevtoolsSession>["connect"]>) {
  return port.snapshot().events.map((entry) => entry.event)
}

function indicatorOf(port: ReturnType<ReturnType<typeof createDevtoolsSession>["connect"]>) {
  return port.snapshot().indicators.find((entry) => entry.indicator.id === "channel")?.indicator
}

describe("createChannelSource", () => {
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    "rejects an invalid frame interval of %s",
    (frameIntervalMs) => {
      expect(() => createChannelSource({ instance: "feed", frameIntervalMs })).toThrowError(
        RangeError,
      )
    },
  )

  it("requires an explicit instance identity", () => {
    const session = createDevtoolsSession()
    session.registerSource(createChannelSource({ instance: "feed" }).source)
    session.registerSource(createChannelSource({ instance: "notices" }).source)
    expect(
      session
        .connect()
        .snapshot()
        .sources.map((source) => source.id),
    ).toEqual([
      { kind: "channel", instance: "feed" },
      { kind: "channel", instance: "notices" },
    ])
  })

  it("composes the host's lifecycle callbacks instead of replacing them", () => {
    const { port, instrumentation } = setup({ instance: "feed" })
    const onStatusChange = vi.fn()
    const onError = vi.fn()
    const options = instrumentation.instrument({
      onStatusChange,
      onError,
    } as unknown as ChannelOptions)

    options.onStatusChange?.("connecting")
    options.onStatusChange?.("open")
    expect(onStatusChange).toHaveBeenCalledWith("connecting")
    expect(onStatusChange).toHaveBeenCalledWith("open")

    const statuses = eventsOf(port)
      .filter((event) => event.kind === "channel.status")
      .map((event) => (event.summary as { status: string }).status)
    expect(statuses).toEqual(["connecting", "open"])
    expect(indicatorOf(port)?.severity).toBe("ok")
  })

  it("counts reconnect attempts across the lifecycle", () => {
    const { port, instrumentation } = setup({ instance: "feed" })
    const options = instrumentation.instrument({} as ChannelOptions)
    options.onStatusChange?.("connecting")
    options.onStatusChange?.("reconnecting")
    options.onStatusChange?.("reconnecting")
    options.onStatusChange?.("open")
    expect(indicatorOf(port)?.value).toContain("2 reconnects")
  })

  it("reports channel errors and preserves the host handler", () => {
    const { port, instrumentation } = setup({ instance: "feed" })
    const onError = vi.fn()
    const options = instrumentation.instrument({ onError } as unknown as ChannelOptions)
    const error = { kind: "channel/closed", message: "secret transport failure" }
    options.onError?.(error as never)

    expect(onError).toHaveBeenCalledWith(error)
    const settle = eventsOf(port).find((event) => event.kind === "channel.error")
    expect(settle?.severity).toBe("error")
    expect(settle?.summary).toMatchObject({ kind: "channel/closed" })
    expect(JSON.stringify(settle)).not.toContain("secret transport failure")
  })

  it("masks an unconstrained channel error kind", () => {
    const { port, instrumentation } = setup({ instance: "feed" })
    const options = instrumentation.instrument({} as ChannelOptions)
    options.onError?.({ kind: "secret-kind", message: "secret-message" } as never)

    const settle = eventsOf(port).find((event) => event.kind === "channel.error")
    expect(settle?.summary).toEqual({ kind: "channel/error" })
    expect(JSON.stringify(settle)).not.toContain("secret")
  })

  it("counts frames and tracks the last-event id without leaking frame data", () => {
    const { port, instrumentation } = setup({ instance: "feed", frameIntervalMs: 0 })
    const channel = fakeChannel("open")
    instrumentation.observe(channel)
    channel.push(frame("message", "secret-payload", "e1"))
    channel.push(frame("message", "more", "e2"))

    const event = eventsOf(port).find((entry) => entry.kind === "channel.event")
    expect(event?.summary).toMatchObject({ type: "message", bytes: 14, id: "e1" })
    expect(JSON.stringify(event?.summary)).not.toContain("secret-payload")
    expect(indicatorOf(port)?.value).toContain("2 events")
    // The indicator surfaces the reconnection cursor promised by the public adapter docs.
    expect(indicatorOf(port)?.value).toContain("last-event-id e2")
  })

  it("reports the UTF-8 byte size of a frame, not its code-unit length", () => {
    const { port, instrumentation } = setup({ instance: "feed", frameIntervalMs: 0 })
    const channel = fakeChannel("open")
    instrumentation.observe(channel)
    // "€" is one JS string char but three UTF-8 bytes; "bytes" must be honest about the wire size.
    channel.push(frame("message", "€"))
    const event = eventsOf(port).find((entry) => entry.kind === "channel.event")
    expect(event?.summary).toMatchObject({ type: "message", bytes: 3 })
  })

  it("passes only safe metadata to a custom frame summary", () => {
    let received: unknown
    const { instrumentation } = setup({
      instance: "feed",
      frameIntervalMs: 0,
      frameSummary: (metadata) => {
        received = metadata
        return { ...metadata }
      },
    })
    const channel = fakeChannel("open")
    instrumentation.observe(channel)
    channel.push(frame("message", "secret-payload", "e1"))

    expect(received).toEqual({ type: "message", bytes: 14, id: "e1" })
    expect(JSON.stringify(received)).not.toContain("secret-payload")
  })

  it("coalesces a high-frequency stream while keeping the exact count", () => {
    const { port, instrumentation } = setup({
      instance: "feed",
      frameIntervalMs: 10_000,
      now: () => 1,
    })
    const channel = fakeChannel("open")
    const subscription = instrumentation.observe(channel)
    channel.push(frame("tick"))
    channel.push(frame("tick"))
    channel.push(frame("tick"))

    const emitted = eventsOf(port).filter((event) => event.kind === "channel.event")
    expect(emitted.length).toBeLessThan(3)
    expect(indicatorOf(port)?.value).toContain("3 events")
    subscription.unsubscribe()
  })

  it("stops observing frames after teardown and on source disposal", () => {
    const session = createDevtoolsSession()
    const instrumentation = createChannelSource({ instance: "feed", frameIntervalMs: 0 })
    const subscription = session.registerSource(instrumentation.source)
    const port = session.connect()
    const channel = fakeChannel("open")
    const observation = instrumentation.observe(channel)

    channel.push(frame("message"))
    const before = eventsOf(port).filter((event) => event.kind === "channel.event").length
    observation.unsubscribe()
    channel.push(frame("message"))
    expect(eventsOf(port).filter((event) => event.kind === "channel.event")).toHaveLength(before)

    // Disposing the source releases a still-live observation too: no new frame is observed (and the
    // deregistered source's retained events are forgotten).
    const other = fakeChannel("open")
    instrumentation.observe(other)
    subscription.unsubscribe()
    other.push(frame("message"))
    expect(
      port.snapshot().events.filter((entry) => entry.event.kind === "channel.event"),
    ).toHaveLength(0)
  })
})
