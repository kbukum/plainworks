import type { AuthHeaderProvider, BackoffPolicy } from "@plainworks/std"
import {
  fakeAuthHeaderProvider,
  flushMicrotasks,
  type ManualClock,
  type ManualDelay,
  manualClock,
  manualDelay,
  seededRandom,
} from "@plainworks/testkit"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { ChannelError } from "../error"
import { type FakeTransport, fakeTransport } from "../transport/fake-transport"
import { type Channel, type ChannelOptions, createChannel } from "./channel"
import type { ChannelStatus } from "./status"

const NO_JITTER: BackoffPolicy = { baseMs: 100, maxMs: 500, factor: 2, jitter: "none" }

interface Harness {
  readonly channel: Channel
  readonly transport: FakeTransport
  readonly delay: ManualDelay
  readonly clock: ManualClock
  readonly statuses: ChannelStatus[]
  readonly errors: ChannelError[]
  /** Fire pending backoff waits (small) but never the large connect/idle timeouts. */
  fireBackoff(): number
}

function setup(overrides: Partial<ChannelOptions> = {}): Harness {
  const transport = fakeTransport()
  const delay = manualDelay()
  const clock = manualClock()
  const statuses: ChannelStatus[] = []
  const errors: ChannelError[] = []
  const channel = createChannel({
    transport: transport.factory,
    backoff: NO_JITTER,
    connectTimeoutMs: 30_000,
    minUptimeMs: 1_000,
    clock,
    delay: delay.delay,
    random: seededRandom(1),
    onStatusChange: (status) => statuses.push(status),
    onError: (error) => errors.push(error),
    ...overrides,
  })
  return {
    channel,
    transport,
    delay,
    clock,
    statuses,
    errors,
    fireBackoff: () => delay.fireWhere((ms) => ms < 1_000),
  }
}

/** Drive the channel until the transport has produced its next attempt (after async header build). */
async function nextAttempt(_h: Harness): Promise<void> {
  await flushMicrotasks()
}

describe("createChannel lifecycle", () => {
  test("connects, opens, and dispatches frames to typed and any listeners", async () => {
    const h = setup()
    const any: string[] = []
    const typed: string[] = []
    h.channel.onAny((frame) => any.push(frame.data))
    h.channel.on("tick", (frame) => typed.push(frame.data))

    h.channel.connect()
    expect(h.channel.status).toBe("connecting")
    await nextAttempt(h)

    expect(h.transport.current).toBeDefined()
    h.transport.current?.open()
    expect(h.channel.status).toBe("open")

    h.transport.current?.frame({ type: "tick", data: "1", id: "e1" })
    h.transport.current?.frame({ type: "other", data: "2" })
    expect(any).toEqual(["1", "2"])
    expect(typed).toEqual(["1"])
    expect(h.channel.lastEventId).toBe("e1")
  })

  test("close aborts the live attempt and moves to closed terminally", async () => {
    const h = setup()
    h.channel.connect()
    await nextAttempt(h)
    h.transport.current?.open()

    h.channel.close()
    expect(h.channel.status).toBe("closed")
    expect(h.transport.current?.aborted).toBe(true)
    await flushMicrotasks()
    expect(h.errors).toHaveLength(0)

    // Idempotent + inert after close.
    h.channel.connect()
    expect(h.channel.status).toBe("closed")
  })

  test("a listener that throws is isolated and reported, later listeners still run", async () => {
    const h = setup()
    const seen: string[] = []
    h.channel.onAny(() => {
      throw new Error("boom")
    })
    h.channel.onAny((frame) => seen.push(frame.data))

    h.channel.connect()
    await nextAttempt(h)
    h.transport.current?.open()
    h.transport.current?.frame({ type: "message", data: "ok" })

    expect(seen).toEqual(["ok"])
    expect(h.errors).toHaveLength(1)
    expect(h.errors[0]?.kind).toBe("channel/protocol")
  })

  test("a throwing onStatusChange never interrupts close teardown", async () => {
    const h = setup({
      onStatusChange: () => {
        throw new Error("observer boom")
      },
    })
    h.channel.connect()
    await nextAttempt(h)
    h.transport.current?.open()

    expect(() => h.channel.close()).not.toThrow()
    expect(h.transport.current?.aborted).toBe(true)
    expect(h.channel.status).toBe("closed")
    // The observer fault is reported through onError, not propagated into the lifecycle.
    expect(h.errors.some((e) => e.kind === "channel/protocol")).toBe(true)
  })
})

describe("reconnect classification (S1) — fatal vs retryable from std", () => {
  test("a 401 stops the loop terminally without reconnecting", async () => {
    const h = setup()
    h.channel.connect()
    await nextAttempt(h)
    h.transport.current?.open()
    h.transport.current?.endError(ChannelError.protocol("unauthorized", { status: 401 }))
    await flushMicrotasks()

    expect(h.channel.status).toBe("closed")
    expect(h.transport.attempts).toHaveLength(1)
    expect(h.errors).toHaveLength(1)
    expect(h.errors[0]?.status).toBe(401)
  })

  test("a 503 is retryable and reconnects after a backoff wait", async () => {
    const h = setup()
    h.channel.connect()
    await nextAttempt(h)
    h.transport.current?.endError(ChannelError.protocol("unavailable", { status: 503 }))
    await flushMicrotasks()

    // A backoff wait is now pending; firing it drives the next attempt.
    expect(h.delay.pending.some((p) => p.ms < 1_000)).toBe(true)
    h.fireBackoff()
    await flushMicrotasks()
    expect(h.transport.attempts.length).toBeGreaterThanOrEqual(2)
    expect(h.channel.status).toBe("reconnecting")
  })
})

describe("backoff comes from std, not a local copy", () => {
  test("consecutive flaps request exactly std's nextBackoff schedule", async () => {
    const h = setup({ backoff: NO_JITTER, maxRetries: 5 })
    h.channel.connect()
    await nextAttempt(h)
    // Flap: open then immediate EOF before minUptime → retryable, escalating backoff each time.
    for (let i = 0; i < 3; i++) {
      h.transport.current?.open()
      h.transport.current?.endOk()
      await flushMicrotasks()
      h.fireBackoff()
      await flushMicrotasks()
    }
    // std nextBackoff with jitter "none": baseMs*factor^attempt clamped to maxMs → 100, 200, 400.
    const backoffWaits = h.delay.waits.filter((ms) => ms < 1_000)
    expect(backoffWaits).toEqual([100, 200, 400])
  })
})

describe("stable-open resets backoff (S3)", () => {
  test("a stable connection that ends reconnects with no backoff wait", async () => {
    const h = setup()
    h.channel.connect()
    await nextAttempt(h)
    h.transport.current?.open()
    h.clock.advance(2_000) // exceed minUptime → stable
    h.transport.current?.endOk()
    await flushMicrotasks()

    // Session resolved (stable) → the loop immediately starts a fresh attempt, no backoff pending.
    expect(h.delay.waits.filter((ms) => ms < 1_000)).toEqual([])
    expect(h.transport.attempts.length).toBe(2)
  })

  test("a stable end still honors the server retry: hint before reconnecting", async () => {
    // A maxMs above the 2500ms hint, so the hint survives the std-style cap at the backoff ceiling.
    const h = setup({ backoff: { baseMs: 100, maxMs: 10_000, factor: 2, jitter: "none" } })
    h.channel.connect()
    await nextAttempt(h)
    h.transport.current?.open()
    h.transport.current?.frame({ type: "message", data: "x", retry: 2_500 })
    h.clock.advance(2_000) // exceed minUptime → stable
    h.transport.current?.endOk()
    await flushMicrotasks()

    // The session resolved, but the server's hint gates the next attempt — no immediate reconnect.
    expect(h.transport.attempts.length).toBe(1)
    expect(h.delay.pending.some((p) => p.ms === 2_500)).toBe(true)
    h.delay.fireWhere((ms) => ms === 2_500)
    await flushMicrotasks()
    expect(h.transport.attempts.length).toBe(2)
    h.channel.close()
  })

  test("a flap (open then immediate drop) escalates backoff instead of resetting", async () => {
    const h = setup()
    h.channel.connect()
    await nextAttempt(h)
    h.transport.current?.open()
    h.transport.current?.endOk() // ended before minUptime → flap
    await flushMicrotasks()

    expect(h.delay.waits.filter((ms) => ms < 1_000)).toEqual([100])
  })
})

describe("idle-read timeout (S4)", () => {
  test("a silent open stream past the idle window aborts and reconnects", async () => {
    const h = setup({ idleTimeoutMs: 10_000 })
    h.channel.connect()
    await nextAttempt(h)
    h.transport.current?.open()
    h.clock.advance(2_000) // stable, so the idle drop resets backoff
    // No frames arrive; fire the idle timeout.
    h.delay.fireWhere((ms) => ms === 10_000)
    await flushMicrotasks()

    expect(h.transport.attempts[0]?.aborted).toBe(true)
    expect(h.transport.attempts.length).toBe(2)
  })

  test("each frame resets the idle timer", async () => {
    const h = setup({ idleTimeoutMs: 10_000 })
    h.channel.connect()
    await nextAttempt(h)
    h.transport.current?.open()
    h.transport.current?.frame({ type: "message", data: "a" })
    // The first idle timer was cancelled and re-armed; only the latest is pending.
    const idlePending = h.delay.pending.filter((p) => p.ms === 10_000)
    expect(idlePending).toHaveLength(1)
    expect(h.transport.attempts.length).toBe(1)
  })
})

describe("connect timeout", () => {
  test("a stream that never opens times out and retries", async () => {
    const h = setup()
    h.channel.connect()
    await nextAttempt(h)
    expect(h.transport.current?.aborted).toBe(false)
    // onOpen never fires; fire the connect timeout.
    h.delay.fireWhere((ms) => ms === 30_000)
    await flushMicrotasks()
    expect(h.transport.attempts[0]?.aborted).toBe(true)

    // A retryable timeout schedules a backoff wait before the next attempt.
    h.fireBackoff()
    await flushMicrotasks()
    expect(h.transport.attempts.length).toBe(2)
  })
})

describe("retry ceiling", () => {
  test("exhausting maxRetries consecutive retries closes terminally with an error", async () => {
    const h = setup({ maxRetries: 2 })
    h.channel.connect()
    await nextAttempt(h)
    // The initial attempt plus two retries (maxRetries counts retries, not attempts).
    for (let i = 0; i < 2; i++) {
      h.transport.current?.endError(ChannelError.connect("down"))
      await flushMicrotasks()
      h.fireBackoff()
      await flushMicrotasks()
    }
    h.transport.current?.endError(ChannelError.connect("down"))
    await flushMicrotasks()

    expect(h.channel.status).toBe("closed")
    expect(h.errors).toHaveLength(1)
    // Exhaustion surfaces as the terminal `closed` kind, preserving the last failure as cause.
    const terminal = h.errors[0]
    expect(terminal?.kind).toBe("channel/closed")
    expect(terminal?.cause).toBeInstanceOf(ChannelError)
    if (terminal?.cause instanceof ChannelError) {
      expect(terminal.cause.kind).toBe("channel/connect")
    }
    expect(h.transport.attempts.length).toBe(3)
  })

  test("maxRetries 0 performs a single attempt with no retries", async () => {
    const h = setup({ maxRetries: 0 })
    h.channel.connect()
    await nextAttempt(h)
    h.transport.current?.endError(ChannelError.connect("down"))
    await flushMicrotasks()

    expect(h.channel.status).toBe("closed")
    expect(h.transport.attempts).toHaveLength(1)
    expect(h.delay.waits.filter((ms) => ms < 1_000)).toEqual([])
  })

  test("an injected delay that rejects (not a cancellation) fails the attempt terminally", async () => {
    const h = setup({ delay: () => Promise.reject(new RangeError("no timers")) })
    h.channel.connect()
    await flushMicrotasks()

    // The connect-timeout arm failed → the attempt fails instead of running unbounded.
    expect(h.channel.status).toBe("closed")
    expect(h.errors[0]?.kind).toBe("channel/config")
  })
})

describe("auth + resume are header-only", () => {
  test("resolved auth headers and lastEventId reach the transport context, never a URL", async () => {
    const auth = fakeAuthHeaderProvider({ headers: { authorization: "Bearer t" }, async: true })
    const h = setup({ authProvider: auth.provider, lastEventId: "resume-7" })
    h.channel.connect()
    await nextAttempt(h)

    expect(auth.calls).toBe(1)
    expect(h.transport.current?.context.headers).toEqual({ authorization: "Bearer t" })
    expect(h.transport.current?.context.lastEventId).toBe("resume-7")
    // The provider received the attempt signal so it can bind a refresh to the attempt deadline.
    expect(auth.signals[0]).toBeDefined()
  })

  test("a new event id updates the resume header on the next reconnect", async () => {
    const h = setup()
    h.channel.connect()
    await nextAttempt(h)
    h.transport.current?.open()
    h.transport.current?.frame({ type: "message", data: "x", id: "e9" })
    h.transport.current?.endError(ChannelError.connect("drop"))
    await flushMicrotasks()
    h.fireBackoff()
    await flushMicrotasks()

    expect(h.transport.attempts[1]?.context.lastEventId).toBe("e9")
  })

  test("a cursor-only id update moves the resume cursor; an empty id resets it", async () => {
    const h = setup()
    h.channel.connect()
    await nextAttempt(h)
    h.transport.current?.open()
    h.transport.current?.frame({ type: "message", data: "x", id: "e1" })
    // A control block carrying only `id:` (no frame) still moves the resume cursor.
    h.transport.current?.context.onId?.("e2")
    h.transport.current?.endError(ChannelError.connect("drop"))
    await flushMicrotasks()
    h.fireBackoff()
    await flushMicrotasks()

    expect(h.transport.attempts[1]?.context.lastEventId).toBe("e2")

    // An empty id resets the cursor — the next attempt sends no Last-Event-ID.
    h.transport.current?.context.onId?.("")
    h.transport.current?.endError(ChannelError.connect("drop"))
    await flushMicrotasks()
    h.fireBackoff()
    await flushMicrotasks()

    expect(h.transport.attempts[2]?.context.lastEventId).toBeUndefined()
    h.channel.close()
  })
})

describe("status reflects the dropped stream during backoff", () => {
  test("a flap surfaces reconnecting before the backoff wait, not a stale open", async () => {
    const h = setup()
    h.channel.connect()
    await nextAttempt(h)
    h.transport.current?.open()
    expect(h.channel.status).toBe("open")
    // Drop before minUptime → a retryable flap that backs off before the next attempt.
    h.transport.current?.endError(ChannelError.connect("drop"))
    await flushMicrotasks()

    // Backoff is pending; status must already read reconnecting rather than linger on open.
    expect(h.delay.pending.some((p) => p.ms < 1_000)).toBe(true)
    expect(h.channel.status).toBe("reconnecting")
  })
})

describe("transport factory seam", () => {
  test("each (re)connection attempt builds a fresh transport from the factory", async () => {
    const transport = fakeTransport()
    const factory = vi.fn(transport.factory)
    const h = setup({ transport: factory })
    h.channel.connect()
    await nextAttempt(h)
    transport.current?.endError(ChannelError.connect("drop"))
    await flushMicrotasks()
    h.fireBackoff()
    await flushMicrotasks()

    expect(transport.attempts.length).toBeGreaterThanOrEqual(2)
    expect(factory).toHaveBeenCalledTimes(transport.attempts.length)
    h.channel.close()
  })
})

describe("reconnect disabled", () => {
  test("a retryable drop closes terminally instead of reconnecting", async () => {
    const h = setup({ reconnect: false })
    h.channel.connect()
    await nextAttempt(h)
    h.transport.current?.open()
    h.transport.current?.endError(ChannelError.connect("drop"))
    await flushMicrotasks()

    expect(h.channel.status).toBe("closed")
    expect(h.transport.attempts).toHaveLength(1)
    // No backoff wait was scheduled.
    expect(h.delay.waits.filter((ms) => ms < 1_000)).toEqual([])
  })
})

describe("auth provider failure", () => {
  test("a rejected auth provider closes the channel with the error", async () => {
    const failing: AuthHeaderProvider = () => Promise.reject(new Error("token fetch failed"))
    const h = setup({ authProvider: failing, reconnect: false })
    h.channel.connect()
    await flushMicrotasks()

    expect(h.channel.status).toBe("closed")
    expect(h.errors).toHaveLength(1)
  })
})

describe("configuration guards", () => {
  test("rejects a non-integer or negative maxRetries", () => {
    expect(() => setup({ maxRetries: 0.5 })).toThrow(ChannelError)
    expect(() => setup({ maxRetries: -1 })).toThrow(ChannelError)
  })

  test("rejects a non-finite connectTimeoutMs", () => {
    expect(() => setup({ connectTimeoutMs: Number.NaN })).toThrow(ChannelError)
  })

  test("rejects a negative idleTimeoutMs", () => {
    expect(() => setup({ idleTimeoutMs: -1 })).toThrow(ChannelError)
  })
})

beforeEach(() => {
  vi.restoreAllMocks()
})
