import type { StateSource, WebAbortSignal } from "@plainworks/std"
import { fakeStateSource, flushMicrotasks } from "@plainworks/testkit"
import { describe, expect, test, vi } from "vitest"
import { createChannel } from "../lifecycle/channel"
import { fakeTransport } from "../transport/fake-transport"
import { jsonDecoder } from "./event"
import { createEventRouter } from "./router"
import type { EventSink } from "./sink"
import { createStateSink } from "./state-sink"

/** A channel whose frames a test drives directly through the fake transport. */
function channelOn(transport = fakeTransport()) {
  const channel = createChannel({ transport: transport.factory })
  channel.connect()
  return { channel, transport }
}

/** The current attempt, asserting the transport has been opened by the channel. */
function takeAttempt(transport: ReturnType<typeof fakeTransport>) {
  const attempt = transport.current
  if (!attempt) throw new Error("expected an open transport attempt")
  return attempt
}

describe("createEventRouter", () => {
  test("decodes frames and delivers to every sink in order", async () => {
    const { channel, transport } = channelOn()
    const seen: string[] = []
    const sinkA: EventSink<{ n: number }> = { deliver: (e) => void seen.push(`a:${e.payload.n}`) }
    const sinkB: EventSink<{ n: number }> = { deliver: (e) => void seen.push(`b:${e.payload.n}`) }
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
    const failing: EventSink<{ n: number }> = {
      deliver: (e) => {
        if (e.payload.n === 1) {
          return Promise.reject(new Error("sink down"))
        }
        return undefined
      },
    }
    const router = createEventRouter<{ n: number }>({
      channel,
      decode: jsonDecoder((v) => v as { n: number }),
      sinks: [failing, { deliver: (e) => void good.push(e.payload.n) }],
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
    const router = createEventRouter<{ n: number }>({
      channel,
      decode: (frame) =>
        frame.type === "heartbeat"
          ? undefined
          : { type: frame.type, payload: JSON.parse(frame.data) as { n: number } },
      sinks: [{ deliver: (e) => void seen.push(e.payload.n) }],
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

  test("bounds the buffer and drops the oldest events when a sink falls behind", async () => {
    const { channel, transport } = channelOn()
    const delivered: number[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let first = true
    const sink: EventSink<{ n: number }> = {
      deliver: async (e) => {
        if (first) {
          first = false
          // Stall the drain on the first event so the queue fills to capacity behind it.
          await gate
        }
        delivered.push(e.payload.n)
      },
    }
    const router = createEventRouter<{ n: number }>({
      channel,
      decode: jsonDecoder((v) => v as { n: number }),
      sinks: [sink],
      capacity: 2,
    })

    await flushMicrotasks()
    const attempt = takeAttempt(transport)
    attempt.open()
    for (const n of [1, 2, 3, 4, 5]) {
      attempt.frame({ type: "t", data: JSON.stringify({ n }) })
    }
    await flushMicrotasks()
    release()
    await flushMicrotasks()

    // Event 1 was popped into the stalled sink; with capacity 2 and the default drop-oldest policy, only the freshest two of {2,3,4,5} survive → 4 and 5. The buffer never grew past capacity.
    expect(delivered).toEqual([1, 4, 5])
    router.close()
  })

  test("stops delivering after close", async () => {
    const { channel, transport } = channelOn()
    const seen: number[] = []
    const router = createEventRouter<{ n: number }>({
      channel,
      decode: jsonDecoder((v) => v as { n: number }),
      sinks: [{ deliver: (e) => void seen.push(e.payload.n) }],
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
    const sinkA: EventSink<{ n: number }> = {
      deliver: async (e) => {
        seen.push(`a:${e.payload.n}`)
        // Stall mid-delivery so close() lands while the drain is in flight.
        await gate
      },
    }
    const sinkB: EventSink<{ n: number }> = { deliver: (e) => void seen.push(`b:${e.payload.n}`) }
    const router = createEventRouter<{ n: number }>({
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
    const router = createEventRouter<{ n: number }>({
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
    const sink = createStateSink<{ n: number }, number[]>(source, (event, current) => [
      ...(current ?? []),
      event.payload.n,
    ])

    const signal = new AbortController().signal
    await sink.deliver({ type: "t", payload: { n: 1 } }, signal)
    await sink.deliver({ type: "t", payload: { n: 2 } }, signal)

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
    const router = createEventRouter<{ n: number }>({
      channel,
      decode: jsonDecoder((v) => v as { n: number }),
      sinks: [createStateSink(source, (event, current) => [...(current ?? []), event.payload.n])],
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
