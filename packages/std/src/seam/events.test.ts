import { describe, expect, test } from "vitest"
import type { WebAbortSignal } from "../web"
import type { EventSink, Listener, PlainEvent, Subscription } from "./events"

// Downstream smoke: the event and event-sink seams are the single source of truth for event shapes
// and backpressured delivery, satisfied structurally by `channel`/`query` without a shared import.

describe("event seam", () => {
  test("a typed event carries its type and data", () => {
    const event: PlainEvent<"ping", { at: number }> = { type: "ping", data: { at: 1 } }
    expect(event.type).toBe("ping")
    expect(event.data.at).toBe(1)
  })

  test("a listener receives events and a subscription tears down", () => {
    const seen: string[] = []
    const listener: Listener<PlainEvent<"tick">> = (event) => seen.push(event.type)
    let active = true
    const subscription: Subscription = { unsubscribe: () => (active = false) }

    listener({ type: "tick", data: undefined })
    subscription.unsubscribe()

    expect(seen).toEqual(["tick"])
    expect(active).toBe(false)
  })
})

describe("event-sink seam", () => {
  type Tick = PlainEvent<"tick", number>

  /** A minimal serial driver: deliver each event to the sink in order, awaiting between events. */
  async function drive(
    sink: EventSink<Tick>,
    events: Tick[],
    signal: WebAbortSignal,
  ): Promise<void> {
    for (const event of events) {
      await sink.deliver(event, signal)
    }
  }

  test("delivers serially, awaiting each async deliver before the next (backpressure)", async () => {
    const order: string[] = []
    const sink: EventSink<Tick> = {
      async deliver(event) {
        order.push(`start:${event.data}`)
        await Promise.resolve()
        order.push(`end:${event.data}`)
      },
    }

    await drive(
      sink,
      [
        { type: "tick", data: 1 },
        { type: "tick", data: 2 },
      ],
      new AbortController().signal,
    )

    // No interleaving: event 1 fully settles before event 2 begins.
    expect(order).toEqual(["start:1", "end:1", "start:2", "end:2"])
  })

  test("a sink honors the delivery signal and does not write past shutdown (cancellation)", async () => {
    const writes: number[] = []
    const sink: EventSink<Tick> = {
      deliver(event, signal) {
        if (signal.aborted) return
        writes.push(event.data)
      },
    }
    const controller = new AbortController()
    controller.abort()

    await drive(sink, [{ type: "tick", data: 1 }], controller.signal)
    expect(writes).toEqual([])
  })

  test("a rejecting deliver is observable to the driver, never swallowed (failure)", async () => {
    const sink: EventSink<Tick> = {
      deliver() {
        return Promise.reject(new Error("sink down"))
      },
    }

    await expect(
      drive(sink, [{ type: "tick", data: 1 }], new AbortController().signal),
    ).rejects.toThrow("sink down")
  })
})
