import {
  type Channel,
  createChannel,
  createEventRouter,
  createStateSink,
  type StateProjection,
} from "@plainworks/channel"
import { createQueryClient, createQueryEventSink } from "@plainworks/query"
import type { PlainEvent } from "@plainworks/std"
import {
  fakeStateSource,
  fakeStreamTransport,
  flushMicrotasks,
  manualClock,
  manualDelay,
  seededRandom,
} from "@plainworks/testkit"
import { describe, expect, it } from "vitest"

/**
 * One live stream, decoded once, driving both a `@plainworks/state` slot (via `channel`'s state
 * sink) and the `@plainworks/query` cache (via the query cache sink) through a **single**
 * {@link createEventRouter}. This only type-checks because both sinks are the one `EventSink`
 * contract over the one `PlainEvent` shape owned by `std` — before that unification a query sink
 * and a channel sink were incompatible types and could not share a router's `sinks` list.
 */

/** The demo event this stream carries: an item upsert with an id and a name. */
type ItemEvent = PlainEvent<"item.upserted", { id: number; name: string }>

/** Drive `channel` past the async header build until its next attempt is registered. */
async function connect(channel: Channel): Promise<void> {
  channel.connect()
  await flushMicrotasks()
}

describe("unified event contract", () => {
  it("feeds one stream into a state slot and the query cache, converging under a replay", async () => {
    const transport = fakeStreamTransport()
    const clock = manualClock()
    const channel = createChannel({
      transport: transport.factory,
      backoff: { baseMs: 100, maxMs: 500, factor: 2, jitter: "none" },
      minUptimeMs: 1_000,
      clock,
      delay: manualDelay().delay,
      random: seededRandom(1),
    })

    // State slot: last-write-wins map keyed by id, so redelivery is idempotent.
    const items = fakeStateSource<Record<number, string>>({ initial: {} })
    const project: StateProjection<ItemEvent, Record<number, string>> = (event, current) => ({
      ...(current ?? {}),
      [event.data.id]: event.data.name,
    })

    // Query cache: write the item at its key, idempotent by key.
    const queryClient = createQueryClient()

    // One router, both sinks — the whole point of the unified seam.
    const router = createEventRouter<ItemEvent>({
      channel,
      decode: (frame) =>
        frame.type === "item.upserted"
          ? { type: "item.upserted", data: JSON.parse(frame.data) as { id: number; name: string } }
          : undefined,
      sinks: [
        createStateSink(items, project),
        createQueryEventSink<ItemEvent>(queryClient, (event) => ({
          kind: "set",
          queryKey: ["item", event.data.id],
          update: event.data,
        })),
      ],
    })

    await connect(channel)
    const first = transport.current
    if (!first) throw new Error("expected a first connection attempt")
    first.open()
    clock.advance(2_000) // exceed minUptime → the connection counts as stable
    first.frame({ type: "item.upserted", data: JSON.stringify({ id: 1, name: "alpha" }), id: "1" })
    first.frame({ type: "item.upserted", data: JSON.stringify({ id: 2, name: "beta" }), id: "2" })
    await flushMicrotasks()

    expect(await items.get()).toEqual({ 1: "alpha", 2: "beta" })
    expect(queryClient.getQueryData(["item", 1])).toEqual({ id: 1, name: "alpha" })
    expect(queryClient.getQueryData(["item", 2])).toEqual({ id: 2, name: "beta" })

    // Reconnect: the stream ends cleanly and resumes from the last cursor, which redelivers the
    // boundary event (id 2). Idempotent sinks converge — no duplicate, no corruption.
    first.endOk()
    await flushMicrotasks()
    const second = transport.current
    if (!second) throw new Error("expected a reconnect attempt")
    expect(second).not.toBe(first)
    expect(second.context.lastEventId).toBe("2")
    second.open()
    second.frame({ type: "item.upserted", data: JSON.stringify({ id: 2, name: "beta" }), id: "2" })
    await flushMicrotasks()

    expect(await items.get()).toEqual({ 1: "alpha", 2: "beta" })
    expect(queryClient.getQueryData(["item", 2])).toEqual({ id: 2, name: "beta" })

    router.close()
    channel.close()
  })
})
