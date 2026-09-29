import type { OverflowPolicy } from "@plainworks/std/resilience"
import type { PlainEvent, StateSource } from "@plainworks/std/seam"
import type { WebAbortSignal } from "@plainworks/std/web"
import {
  deferred,
  fakeStateSource,
  fakeStreamTransport,
  flushMicrotasks,
  recordTelemetry,
} from "@plainworks/testkit"
import { describe, expect, test, vi } from "vitest"
import { createChannel } from "../lifecycle"
import { jsonDecoder } from "./event"
import { createEventRouter } from "./router"
import type { EventSink } from "./sink"
import { createStateSink } from "./state-sink"

/** The event shape these tests stream: an untyped-discriminant `PlainEvent` carrying `{ n }`. */
type NEvent = PlainEvent<string, { n: number }>

/** A channel whose frames a test drives directly through the fake transport. */
function channelOn(transport = fakeStreamTransport()) {
  const channel = createChannel({ transport: transport.factory })
  channel.connect()
  return { channel, transport }
}

/** The current attempt, asserting the transport has been opened by the channel. */
function takeAttempt(transport: ReturnType<typeof fakeStreamTransport>) {
  const attempt = transport.current
  if (!attempt) throw new Error("expected an open transport attempt")
  return attempt
}

describe("createEventRouter", () => {
  test("decodes frames and delivers to every sink in order", async () => {
    const { channel, transport } = channelOn()
    const seen: string[] = []
    const sinkA: EventSink<NEvent> = { deliver: (e) => void seen.push(`a:${e.data.n}`) }
    const sinkB: EventSink<NEvent> = { deliver: (e) => void seen.push(`b:${e.data.n}`) }
    const router = createEventRouter({
      channel,
      decode: jsonDecoder((v) => v as { n: number }),
      sinks: [sinkA, sinkB],
    })

    await flushMicrotasks()
    const attempt = takeAttempt(transport)
    attempt.open()
    attempt.frame({ type: "tick", data: JSON.stringify({ n: 1 }) })
    await flushMicrotasks()

    expect(seen).toEqual(["a:1", "b:1"])
    router.close()
  })

  test("reports a malformed-JSON frame via onError instead of silently dropping", async () => {
    const { channel, transport } = channelOn()
    const onError = vi.fn()
    const delivered: unknown[] = []
    const router = createEventRouter({
      channel,
      decode: jsonDecoder((v) => v as { n: number }),
      sinks: [{ deliver: (e) => void delivered.push(e) }],
      onError,
    })

    await flushMicrotasks()
    const attempt = takeAttempt(transport)
    attempt.open()
    attempt.frame({ type: "x", data: "not json" })
    await flushMicrotasks()

    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ kind: "channel/protocol" })
    expect(delivered).toEqual([])
    router.close()
  })

  test("reports a decode failure and drops the frame", async () => {
    const { channel, transport } = channelOn()
    const onError = vi.fn()
    const delivered: unknown[] = []
    const router = createEventRouter({
      channel,
      decode: jsonDecoder(() => {
        throw new Error("invalid")
      }),
      sinks: [{ deliver: (e) => void delivered.push(e) }],
      onError,
    })

    await flushMicrotasks()
    const attempt = takeAttempt(transport)
    attempt.open()
    attempt.frame({ type: "x", data: "{}" })
    await flushMicrotasks()

    expect(onError).toHaveBeenCalledOnce()
    expect(delivered).toEqual([])
    router.close()
  })

  test("a sink rejection is reported and does not stall the stream", async () => {
    const { channel, transport } = channelOn()
    const onError = vi.fn()
    const good: number[] = []
    const failing: EventSink<NEvent> = {
      deliver: (e) => {
        if (e.data.n === 1) {
          return Promise.reject(new Error("sink down"))
        }
        return undefined
      },
    }
    const router = createEventRouter<NEvent>({
      channel,
      decode: jsonDecoder((v) => v as { n: number }),
      sinks: [failing, { deliver: (e) => void good.push(e.data.n) }],
      onError,
    })

    await flushMicrotasks()
    const attempt = takeAttempt(transport)
    attempt.open()
    attempt.frame({ type: "t", data: JSON.stringify({ n: 1 }) })
    attempt.frame({ type: "t", data: JSON.stringify({ n: 2 }) })
    await flushMicrotasks()

    expect(onError).toHaveBeenCalledOnce()
    expect(good).toEqual([1, 2])
    router.close()
  })

  test("drops a frame the decoder ignores (returns undefined)", async () => {
    const { channel, transport } = channelOn()
    const seen: number[] = []
    const router = createEventRouter<NEvent>({
      channel,
      decode: (frame) =>
        frame.type === "heartbeat"
          ? undefined
          : { type: frame.type, data: JSON.parse(frame.data) as { n: number } },
      sinks: [{ deliver: (e) => void seen.push(e.data.n) }],
    })

    await flushMicrotasks()
    const attempt = takeAttempt(transport)
    attempt.open()
    attempt.frame({ type: "heartbeat", data: "" })
    attempt.frame({ type: "t", data: JSON.stringify({ n: 5 }) })
    await flushMicrotasks()

    expect(seen).toEqual([5])
    router.close()
  })

  describe("overflow", () => {
    /** Stall the sink on event 1, push 2..5 into a capacity-2 buffer, then let the drain finish. */
    async function overflowRun(options: {
      overflow: OverflowPolicy
      onDrop?: (event: NEvent) => void
      telemetry?: ReturnType<typeof recordTelemetry>
    }) {
      const { channel, transport } = channelOn()
      const gate = deferred<void>()
      const delivered: number[] = []
      const router = createEventRouter<NEvent>({
        channel,
        decode: jsonDecoder((v) => v as { n: number }),
        sinks: [
          {
            deliver: async (e) => {
              if (e.data.n === 1) {
                await gate.promise
              }
              delivered.push(e.data.n)
            },
          },
        ],
        capacity: 2,
        overflow: options.overflow,
        ...(options.onDrop ? { onDrop: options.onDrop } : {}),
        ...(options.telemetry ? { telemetry: options.telemetry } : {}),
      })
      await flushMicrotasks()
      const attempt = takeAttempt(transport)
      attempt.open()
      for (const n of [1, 2, 3, 4, 5]) {
        attempt.frame({ type: "tick", data: JSON.stringify({ n }) })
      }
      await flushMicrotasks()
      gate.resolve()
      await flushMicrotasks()
      router.close()
      return { delivered, channel }
    }

    test.each([
      { overflow: "drop-oldest", delivered: [1, 4, 5], dropped: [2, 3] },
      { overflow: "drop-new", delivered: [1, 2, 3], dropped: [4, 5] },
      { overflow: "reject", delivered: [1, 2, 3], dropped: [4, 5] },
    ] as const)("$overflow reports every dropped event", async (row) => {
      const dropped: number[] = []

      const { delivered, channel } = await overflowRun({
        overflow: row.overflow,
        onDrop: (event) => void dropped.push(event.data.n),
      })

      expect(delivered).toEqual(row.delivered)
      expect(dropped).toEqual(row.dropped)
      expect(channel.status).not.toBe("closed")
    })

    test("emits a telemetry event for every drop", async () => {
      const telemetry = recordTelemetry()

      await overflowRun({ overflow: "drop-oldest", telemetry })

      expect(telemetry.records).toEqual([
        {
          kind: "event",
          name: "channel.event.dropped",
          attributes: { "channel.overflow.policy": "drop-oldest", "channel.event.type": "tick" },
        },
        {
          kind: "event",
          name: "channel.event.dropped",
          attributes: { "channel.overflow.policy": "drop-oldest", "channel.event.type": "tick" },
        },
      ])
    })

    test("a throwing drop observer does not stall the stream", async () => {
      const { delivered } = await overflowRun({
        overflow: "drop-new",
        onDrop: () => {
          throw new Error("observer failed")
        },
      })

      expect(delivered).toEqual([1, 2, 3])
    })
  })

  test("stops delivering after close", async () => {
    const { channel, transport } = channelOn()
    const seen: number[] = []
    const router = createEventRouter<NEvent>({
      channel,
      decode: jsonDecoder((v) => v as { n: number }),
      sinks: [{ deliver: (e) => void seen.push(e.data.n) }],
    })

    await flushMicrotasks()
    const attempt = takeAttempt(transport)
    attempt.open()
    router.close()
    attempt.frame({ type: "t", data: JSON.stringify({ n: 9 }) })
    await flushMicrotasks()

    expect(seen).toEqual([])
  })

  test("close during an in-flight delivery delivers no further sinks or events", async () => {
    const { channel, transport } = channelOn()
    const seen: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const sinkA: EventSink<NEvent> = {
      deliver: async (e) => {
        seen.push(`a:${e.data.n}`)
        // Stall mid-delivery so close() lands while the drain is in flight.
        await gate
      },
    }
    const sinkB: EventSink<NEvent> = { deliver: (e) => void seen.push(`b:${e.data.n}`) }
    const router = createEventRouter<NEvent>({
      channel,
      decode: jsonDecoder((v) => v as { n: number }),
      sinks: [sinkA, sinkB],
    })

    await flushMicrotasks()
    const attempt = takeAttempt(transport)
    attempt.open()
    attempt.frame({ type: "t", data: JSON.stringify({ n: 1 }) })
    attempt.frame({ type: "t", data: JSON.stringify({ n: 2 }) })
    await flushMicrotasks()

    // The drain is stalled inside sinkA on event 1, with event 2 buffered behind it.
    router.close()
    release()
    await flushMicrotasks()

    expect(seen).toEqual(["a:1"])
  })

  test("sinks receive the drain abort signal so in-flight delivery can cancel on close", async () => {
    const { channel, transport } = channelOn()
    let seenSignal: WebAbortSignal | undefined
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const router = createEventRouter<NEvent>({
      channel,
      decode: jsonDecoder((v) => v as { n: number }),
      sinks: [
        {
          deliver: async (_event, signal) => {
            seenSignal = signal
            await gate
          },
        },
      ],
    })

    await flushMicrotasks()
    const attempt = takeAttempt(transport)
    attempt.open()
    attempt.frame({ type: "t", data: JSON.stringify({ n: 1 }) })
    await flushMicrotasks()

    expect(seenSignal?.aborted).toBe(false)
    router.close()
    expect(seenSignal?.aborted).toBe(true)
    release()
    await flushMicrotasks()
  })
})

describe("createStateSink", () => {
  test("folds events through the StateSource contract (get then set)", async () => {
    const source = fakeStateSource<number[]>()
    const sink = createStateSink<NEvent, number[]>(source, (event, current) => [
      ...(current ?? []),
      event.data.n,
    ])

    const signal = new AbortController().signal
    await sink.deliver({ type: "t", data: { n: 1 } }, signal)
    await sink.deliver({ type: "t", data: { n: 2 } }, signal)

    expect(await source.get()).toEqual([1, 2])
  })

  test("does not write state when the router closes mid-read", async () => {
    const { channel, transport } = channelOn()
    let release!: (value: number[] | undefined) => void
    const gate = new Promise<number[] | undefined>((resolve) => {
      release = resolve
    })
    const writes: number[][] = []
    const source: StateSource<number[]> = {
      capabilities: {
        access: "async",
        authority: "local",
        durable: false,
        sharedAcrossTabs: false,
        sentToServer: false,
        availableAtImport: true,
      },
      get: () => gate,
      set: (value) => {
        writes.push(value)
        return Promise.resolve()
      },
      remove: () => Promise.resolve(),
      subscribe: () => ({ unsubscribe: () => {} }),
    }
    const router = createEventRouter<NEvent>({
      channel,
      decode: jsonDecoder((v) => v as { n: number }),
      sinks: [createStateSink(source, (event, current) => [...(current ?? []), event.data.n])],
    })

    await flushMicrotasks()
    const attempt = takeAttempt(transport)
    attempt.open()
    attempt.frame({ type: "t", data: JSON.stringify({ n: 1 }) })
    await flushMicrotasks()

    // The sink is parked in `get` when the router closes — the write must be skipped.
    router.close()
    release(undefined)
    await flushMicrotasks()
    expect(writes).toEqual([])
  })
})
