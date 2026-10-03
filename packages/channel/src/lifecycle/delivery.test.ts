import { convergenceFixture } from "@plainworks/mocks/stream"
import {
  deferred,
  flushMicrotasks,
  manualClock,
  manualDelay,
  seededRandom,
} from "@plainworks/testkit"
import { fakeFetch, fakeStreamTransport } from "@plainworks/testkit/fakes"
import { describe, expect, it } from "vitest"
import { createEventRouter, jsonDecoder } from "../events"
import { createSseTransport } from "../transport/sse"
import { createChannel } from "./channel"

const epoch = "00000000000000000000000000000001"
const frame = (sequence: bigint) => ({
  type: "google.protobuf.Method",
  data: '{"name":"visible"}',
  id: `${epoch}:${sequence}`,
})

describe("acknowledged delivery", () => {
  it("honors a standalone SSE retry directive even when EOF follows without an event", async () => {
    const http = fakeFetch([
      new Response("retry: 5000\n\n", {
        headers: { "content-type": "text/event-stream" },
      }),
    ])
    const delay = manualDelay()
    const channel = createChannel({
      transport: createSseTransport({ url: "https://events.test", fetch: http.fetch }),
      delay: delay.delay,
      minUptimeMs: 0,
      retryBudgetMs: 6000,
      backoff: { baseMs: 10, maxMs: 20, factor: 2, jitter: "none" },
    })
    channel.connect()
    await flushMicrotasks()
    expect(delay.pending.map(({ ms }) => ms)).toEqual([5000])
    expect(channel.lastEventId).toBeUndefined()
    channel.close()
    expect(delay.pending).toHaveLength(0)
  })

  it("keeps the delivery owner across retryable failures and honors an uncapped server wait", async () => {
    const transport = fakeStreamTransport()
    const clock = manualClock()
    const delay = manualDelay()
    let applied = 0
    const channel = createChannel({
      transport: transport.factory,
      clock,
      delay: delay.delay,
      minUptimeMs: 0,
      retryBudgetMs: 200,
      backoff: { baseMs: 10, maxMs: 20, factor: 2, jitter: "none" },
    })
    const router = createEventRouter({
      channel,
      decode: jsonDecoder((value) => value),
      sinks: [
        {
          deliver() {
            applied++
          },
        },
      ],
    })
    channel.connect()
    await flushMicrotasks()
    transport.current?.open()
    transport.current?.frame({
      type: "failure",
      data: JSON.stringify({
        code: "SERVICE_UNAVAILABLE",
        message: "Wait",
        retryable: true,
        retryAfter: 0.06,
      }),
    })
    await flushMicrotasks()
    expect(delay.pending.map(({ ms }) => ms)).toEqual([60])
    clock.advance(60)
    delay.fireWhere((ms) => ms === 60)
    await flushMicrotasks()
    transport.current?.open()
    transport.current?.frame(frame(2n))
    await flushMicrotasks()
    expect(applied).toBe(1)
    expect(channel.lastEventId).toBe(`${epoch}:2`)
    router.close()
    channel.close()
    transport.assertClosed()
  })

  it("invalidates unacknowledged leases on explicit close", async () => {
    const transport = fakeStreamTransport()
    const channel = createChannel({ transport: transport.factory })
    const pending = frame(1n)
    channel.connect()
    await flushMicrotasks()
    transport.current?.open()
    transport.current?.frame(pending)
    channel.close()
    expect(channel.error).toBeUndefined()
    channel.acknowledge(pending)
    expect(channel.lastEventId).toBeUndefined()
    transport.assertClosed()
  })

  it("counts initial connection admission against the total retry budget", async () => {
    const transport = fakeStreamTransport()
    const clock = manualClock()
    const delay = manualDelay()
    const channel = createChannel({
      transport: transport.factory,
      clock,
      delay: delay.delay,
      connectTimeoutMs: 100,
      retryBudgetMs: 10,
    })
    channel.connect()
    await flushMicrotasks()
    expect(delay.pending.map(({ ms }) => ms)).toEqual([10])
    clock.advance(10)
    delay.fireWhere((ms) => ms === 10)
    await flushMicrotasks()
    expect(channel.status).toBe("closed")
    expect(transport.attempts).toHaveLength(1)
    expect(delay.pending).toHaveLength(0)
    transport.assertClosed()
  })

  it("executes the published acknowledgement operations against the real router", async () => {
    const fixture = convergenceFixture.cases[0]
    const transport = fakeStreamTransport()
    const gate = deferred<void>()
    const channel = createChannel({ transport: transport.factory })
    let applied = 0
    const router = createEventRouter({
      channel,
      decode: jsonDecoder((value) => value),
      sinks: [
        {
          deliver: async () => {
            await gate.promise
            applied++
          },
        },
      ],
    })
    channel.connect()
    await flushMicrotasks()
    transport.current?.open()
    for (const operation of fixture.operations) {
      if (operation.kind === "event") transport.current?.frame(frame(BigInt(operation.sequence)))
      if (operation.kind === "apply") {
        if (operation.sequence === 4) transport.current?.frame(frame(4n))
        gate.resolve()
      }
      await flushMicrotasks()
      if (operation.kind === "reconnect") {
        expect(channel.lastEventId ?? `${epoch}:0`).toBe(`${epoch}:${operation.wantSequence}`)
      }
    }
    expect(applied).toBe(fixture.want.applied)
    expect(channel.lastEventId).toBe(`${epoch}:${fixture.want.acknowledged}`)
    router.close()
    channel.close()
  })

  it("100 subscribe/teardown cycles leave no listeners, timers, or open streams", async () => {
    const transport = fakeStreamTransport()
    const delay = manualDelay()
    const channel = createChannel({ transport: transport.factory, delay: delay.delay })
    for (let cycle = 0; cycle < 100; cycle++) {
      const router = createEventRouter({
        channel,
        decode: jsonDecoder((value) => value),
        sinks: [{ deliver() {} }],
      })
      const typed = channel.on("typed", () => {})
      channel.connect()
      await flushMicrotasks()
      transport.current?.open()
      transport.current?.frame(frame(BigInt(cycle + 1)))
      await flushMicrotasks()
      router.close()
      typed.unsubscribe()
      channel.close()
      await flushMicrotasks()
      expect(channel.listenerCount).toBe(0)
      expect(delay.pending).toHaveLength(0)
      transport.assertClosed()
    }
  })
  it("resumes only after every sink applies and drops acknowledged duplicates", async () => {
    const transport = fakeStreamTransport()
    const gate = deferred<void>()
    const channel = createChannel({ transport: transport.factory })
    let applied = 0
    const router = createEventRouter({
      channel,
      decode: jsonDecoder((value) => value),
      sinks: [
        {
          deliver: async () => {
            await gate.promise
            applied++
          },
        },
      ],
    })
    channel.connect()
    await flushMicrotasks()
    transport.current?.open()
    transport.current?.frame(frame(9007199254740993n))
    await flushMicrotasks()
    expect(channel.lastEventId).toBeUndefined()
    gate.resolve()
    await flushMicrotasks()
    expect(channel.lastEventId).toBe(`${epoch}:9007199254740993`)
    transport.current?.frame(frame(9007199254740993n))
    transport.current?.frame(frame(9007199254740995n))
    await flushMicrotasks()
    expect(applied).toBe(2)
    router.close()
    channel.close()
  })

  it("a reset discards the old delivery acknowledgement and reaches sinks", async () => {
    const transport = fakeStreamTransport()
    const gate = deferred<void>()
    const channel = createChannel({ transport: transport.factory })
    let resets = 0
    const router = createEventRouter({
      channel,
      decode: jsonDecoder((value) => value),
      sinks: [
        {
          deliver: () => gate.promise,
          reset: () => {
            resets++
          },
        },
      ],
    })
    channel.connect()
    await flushMicrotasks()
    transport.current?.open()
    transport.current?.frame(frame(1n))
    await flushMicrotasks()
    transport.current?.frame({
      type: "reset",
      data: JSON.stringify({ reason: "replayExpired", cursor: `${epoch}:2` }),
      id: `${epoch}:1`,
    })
    gate.resolve()
    await flushMicrotasks()
    expect(channel.lastEventId).toBeUndefined()
    expect(resets).toBe(1)
    router.close()
    channel.close()
  })

  it("terminal failure settles before EOF and never reconnects", async () => {
    const transport = fakeStreamTransport()
    const errors: unknown[] = []
    const delay = manualDelay()
    const channel = createChannel({
      transport: transport.factory,
      delay: delay.delay,
      onError: (error) => errors.push(error),
    })
    channel.connect()
    await flushMicrotasks()
    transport.current?.open()
    transport.current?.frame({
      type: "failure",
      data: JSON.stringify({ code: "TOKEN_EXPIRED", message: "Sign in.", retryable: true }),
    })
    await flushMicrotasks()
    expect(channel.status).toBe("closed")
    expect(errors).toMatchObject([{ code: "TOKEN_EXPIRED", authentication: "unauthenticated" }])
    expect(channel.error).toBe(errors[0])
    transport.current?.endOk()
    delay.fireWhere(() => true)
    await flushMicrotasks()
    expect(transport.attempts).toHaveLength(1)
    transport.assertClosed()
  })

  it.each([true, false])(
    "delivers a failure frame once to both listener sets: retryable=%s",
    async (retryable) => {
      const transport = fakeStreamTransport()
      const delay = manualDelay()
      const channel = createChannel({ transport: transport.factory, delay: delay.delay })
      const typed: unknown[] = []
      const any: unknown[] = []
      channel.on("failure", (frame) => typed.push(frame))
      channel.onAny((frame) => any.push(frame))
      channel.connect()
      await flushMicrotasks()
      transport.current?.open()
      const failure = {
        type: "failure",
        data: JSON.stringify({
          code: retryable ? "SERVICE_UNAVAILABLE" : "TOKEN_EXPIRED",
          message: "Failure",
          retryable,
        }),
      }
      transport.current?.frame(failure)
      await flushMicrotasks()
      expect(typed).toEqual([failure])
      expect(any).toEqual([failure])
      expect(channel.status).toBe(retryable ? "reconnecting" : "closed")
      channel.close()
      expect(delay.pending).toHaveLength(0)
      transport.assertClosed()
    },
  )

  it("does not cap a server minimum or reset its failure budget after a stable open", async () => {
    const transport = fakeStreamTransport()
    const delay = manualDelay()
    const channel = createChannel({
      transport: transport.factory,
      minUptimeMs: 0,
      maxRetries: 2,
      retryBudgetMs: 100,
      backoff: { baseMs: 10, maxMs: 20, factor: 2, jitter: "full" },
      random: seededRandom(1),
      delay: delay.delay,
    })
    channel.connect()
    await flushMicrotasks()
    transport.current?.open()
    transport.current?.frame({
      type: "failure",
      data: JSON.stringify({
        code: "SERVICE_UNAVAILABLE",
        message: "Wait.",
        retryable: true,
        retryAfter: 60,
      }),
    })
    await flushMicrotasks()
    expect(channel.status).toBe("closed")
    expect(transport.attempts).toHaveLength(1)
    transport.assertClosed()
  })
})
