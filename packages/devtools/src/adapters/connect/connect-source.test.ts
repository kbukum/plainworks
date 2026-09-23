import { Code, ConnectError, type Interceptor, type UnaryRequest } from "@connectrpc/connect"
import { TimeoutError } from "@plainworks/std"
import { describe, expect, it } from "vitest"
import { createDevtoolsSession } from "../../session"
import type { SourceObserver } from "../../source"
import { type ConnectSourceOptions, createConnectSource } from "./connect-source"

type Next = Parameters<Interceptor>[0]
type Req = Parameters<Next>[0]
type Res = Awaited<ReturnType<Next>>

function unaryRequest(service: string, method: string): Req {
  return {
    stream: false,
    service: { typeName: service },
    method: { name: method },
  } as unknown as UnaryRequest
}

function streamRequest(service: string, method: string): Req {
  return {
    stream: true,
    service: { typeName: service },
    method: { name: method },
  } as unknown as Req
}

function unaryResponse(): Res {
  return { stream: false, message: {} } as unknown as Res
}

function streamResponse(message: AsyncIterable<unknown>): Res {
  return { stream: true, message } as unknown as Res
}

function setup(options: ConnectSourceOptions) {
  const session = createDevtoolsSession()
  const { source, interceptor } = createConnectSource(options)
  session.registerSource(source)
  const port = session.connect()
  return { session, port, interceptor }
}

function eventsOf(port: ReturnType<ReturnType<typeof createDevtoolsSession>["connect"]>) {
  return port.snapshot().events.map((entry) => entry.event)
}

describe("createConnectSource", () => {
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    "rejects an invalid message interval of %s",
    (messageIntervalMs) => {
      expect(() => createConnectSource({ instance: "api", messageIntervalMs })).toThrowError(
        RangeError,
      )
    },
  )

  it("requires an explicit instance identity", () => {
    const session = createDevtoolsSession()
    session.registerSource(createConnectSource({ instance: "api" }).source)
    session.registerSource(createConnectSource({ instance: "admin" }).source)
    expect(
      session
        .connect()
        .snapshot()
        .sources.map((source) => source.id),
    ).toEqual([
      { kind: "connect", instance: "api" },
      { kind: "connect", instance: "admin" },
    ])
  })

  it("correlates a unary call by service/method and preserves the response", async () => {
    let clock = 100
    const { port, interceptor } = setup({ instance: "api", now: () => clock })
    const next: Next = async () => {
      clock = 130
      return unaryResponse()
    }
    const response = await interceptor(next)(unaryRequest("shop.Cart", "AddItem"))
    expect(response.stream).toBe(false)

    const events = eventsOf(port)
    const start = events.find((event) => event.kind === "rpc.request")
    const done = events.find((event) => event.kind === "rpc.response")
    expect(start?.summary).toMatchObject({ service: "shop.Cart", method: "AddItem", stream: false })
    expect(done?.severity).toBe("ok")
    expect(done?.summary).toMatchObject({ durationMs: 30, outcome: "ok" })
    expect((start?.summary as { id?: string } | undefined)?.id).toBe(
      (done?.summary as { id?: string } | undefined)?.id,
    )
  })

  it("reports a unary error and re-throws the original ConnectError", async () => {
    const { port, interceptor } = setup({ instance: "api" })
    const failure = new ConnectError("boom", Code.Internal)
    const next: Next = async () => {
      throw failure
    }
    await expect(interceptor(next)(unaryRequest("shop.Cart", "AddItem"))).rejects.toBe(failure)

    const settle = eventsOf(port).find((event) => event.kind === "rpc.error")
    expect(settle?.severity).toBe("error")
    expect(settle?.summary).toMatchObject({ outcome: "error", code: "internal" })
    const indicator = port.snapshot().indicators.find((entry) => entry.indicator.id === "rpc")
    expect(indicator?.indicator.value).toContain("failing")
  })

  it("classifies a per-attempt deadline as a timeout with a typed code, not a cancellation", async () => {
    const { port, interceptor } = setup({ instance: "api" })
    // A local deadline aborts the attempt signal with a std TimeoutError reason; the transport then
    // rejects with a bare ConnectError(Canceled) that is indistinguishable from a real cancel — the
    // signal reason is what tells them apart, before the outer layer remaps it to
    // deadline_exceeded.
    const controller = new AbortController()
    controller.abort(new TimeoutError(10))
    const request = {
      ...(unaryRequest("shop.Cart", "AddItem") as object),
      signal: controller.signal,
    } as Req
    const next: Next = async () => {
      throw new ConnectError("canceled", Code.Canceled)
    }
    await expect(interceptor(next)(request)).rejects.toBeInstanceOf(ConnectError)

    const settle = eventsOf(port).find((event) => event.kind === "rpc.timeout")
    expect(settle?.severity).toBe("warn")
    expect(settle?.summary).toMatchObject({ outcome: "timeout", code: "deadline_exceeded" })
    const indicator = port.snapshot().indicators.find((entry) => entry.indicator.id === "rpc")
    expect(indicator?.indicator.value).not.toContain("failing")
  })

  it("classifies a canceled call as canceled, not a failure", async () => {
    const { port, interceptor } = setup({ instance: "api" })
    const next: Next = async () => {
      throw new ConnectError("canceled", Code.Canceled)
    }
    await expect(interceptor(next)(unaryRequest("shop.Cart", "AddItem"))).rejects.toBeInstanceOf(
      ConnectError,
    )
    const settle = eventsOf(port).find((event) => event.kind === "rpc.canceled")
    expect(settle?.severity).toBe("warn")
    const indicator = port.snapshot().indicators.find((entry) => entry.indicator.id === "rpc")
    expect(indicator?.indicator.value).not.toContain("failing")
  })

  it("reports the streaming lifecycle: open, message counts, and a definite close", async () => {
    const { port, interceptor } = setup({ instance: "api", messageIntervalMs: 0 })
    async function* source() {
      yield 1
      yield 2
      yield 3
    }
    const next: Next = async () => streamResponse(source())
    const response = await interceptor(next)(streamRequest("shop.Feed", "Watch"))

    const received: unknown[] = []
    for await (const value of (response as { message: AsyncIterable<unknown> }).message) {
      received.push(value)
    }
    expect(received).toEqual([1, 2, 3])

    const kinds = eventsOf(port).map((event) => event.kind)
    expect(kinds).toContain("rpc.stream.open")
    expect(kinds.filter((kind) => kind === "rpc.stream.message")).toHaveLength(3)
    const close = eventsOf(port).find((event) => event.kind === "rpc.stream.close")
    expect(close?.summary).toMatchObject({ outcome: "ok", messages: 3 })
  })

  it("closes a streaming call with an error outcome and re-throws", async () => {
    const { port, interceptor } = setup({ instance: "api", messageIntervalMs: 0 })
    const failure = new ConnectError("mid-stream", Code.Unavailable)
    async function* source() {
      yield 1
      throw failure
    }
    const next: Next = async () => streamResponse(source())
    const response = await interceptor(next)(streamRequest("shop.Feed", "Watch"))

    await expect(async () => {
      for await (const _value of (response as { message: AsyncIterable<unknown> }).message) {
        // drain until the error
      }
    }).rejects.toBe(failure)

    const close = eventsOf(port).find((event) => event.kind === "rpc.stream.error")
    expect(close?.summary).toMatchObject({ outcome: "error", messages: 1 })
  })

  it("closes canceled and tears down the source when the consumer stops early", async () => {
    const { port, interceptor } = setup({ instance: "api", messageIntervalMs: 0 })
    let returned = false
    async function* source() {
      try {
        yield 1
        yield 2
        yield 3
      } finally {
        returned = true
      }
    }
    const next: Next = async () => streamResponse(source())
    const response = await interceptor(next)(streamRequest("shop.Feed", "Watch"))

    for await (const _value of (response as { message: AsyncIterable<unknown> }).message) {
      break
    }
    expect(returned).toBe(true)
    const close = eventsOf(port).find((event) => event.kind === "rpc.stream.canceled")
    expect(close?.summary).toMatchObject({ outcome: "canceled", messages: 1 })
  })

  it("preserves a stream failure when iterator cleanup also fails", async () => {
    const { interceptor } = setup({ instance: "api", messageIntervalMs: 0 })
    const failure = new ConnectError("stream failed", Code.Unavailable)
    const cleanupFailure = new Error("cleanup failed")
    const source: AsyncIterable<unknown> = {
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            throw failure
          },
          return: async () => {
            throw cleanupFailure
          },
        }
      },
    }
    const response = await interceptor(async () => streamResponse(source))(
      streamRequest("shop.Feed", "Watch"),
    )

    const iterator = (response as { message: AsyncIterable<unknown> }).message[
      Symbol.asyncIterator
    ]()
    await expect(iterator.next()).rejects.toBe(failure)
  })

  it("preserves normal stream completion when iterator cleanup fails", async () => {
    const { interceptor } = setup({ instance: "api", messageIntervalMs: 0 })
    const source: AsyncIterable<unknown> = {
      [Symbol.asyncIterator]() {
        return {
          next: async () => ({ done: true as const, value: undefined }),
          return: async () => {
            throw new Error("cleanup failed")
          },
        }
      },
    }
    const response = await interceptor(async () => streamResponse(source))(
      streamRequest("shop.Feed", "Watch"),
    )

    const consume = async (): Promise<void> => {
      for await (const _message of (response as { message: AsyncIterable<unknown> }).message) {
        // The source is already complete.
      }
    }
    await expect(consume()).resolves.toBeUndefined()
  })

  it("releases stream sampling on disposal without canceling the caller-owned stream", async () => {
    let clockCalls = 0
    const session = createDevtoolsSession()
    const { source, interceptor } = createConnectSource({
      instance: "api",
      messageIntervalMs: 100,
      now: () => {
        clockCalls += 1
        return 1
      },
    })
    const subscription = session.registerSource(source)
    session.connect()
    async function* messages() {
      yield 1
      yield 2
      yield 3
    }
    const response = await interceptor(async () => streamResponse(messages()))(
      streamRequest("shop.Feed", "Watch"),
    )
    const iterator = (response as { message: AsyncIterable<unknown> }).message[
      Symbol.asyncIterator
    ]()

    await iterator.next()
    await iterator.next()
    subscription.unsubscribe()
    const callsAtDisposal = clockCalls

    await expect(iterator.next()).resolves.toMatchObject({ done: false, value: 3 })
    expect(clockCalls).toBe(callsAtDisposal)
    await iterator.return?.()
  })

  it("stops observing after the source is disposed", async () => {
    const session = createDevtoolsSession()
    const { source, interceptor } = createConnectSource({ instance: "api" })
    const subscription = session.registerSource(source)
    const port = session.connect()
    subscription.unsubscribe()
    await interceptor(async () => unaryResponse())(unaryRequest("shop.Cart", "AddItem"))
    expect(port.snapshot().events).toHaveLength(0)
  })

  it("isolates a faulting bridge from the call and stream, on unary and streaming paths", async () => {
    const throwing: SourceObserver = {
      emit: () => {
        throw new Error("bridge down")
      },
      indicate: () => {
        throw new Error("bridge down")
      },
      fail: () => {},
      recover: () => {},
    }
    const { source, interceptor } = createConnectSource({ instance: "api", messageIntervalMs: 0 })
    source.connect(throwing, undefined as never)

    // A unary call resolves despite every observation throwing.
    await expect(
      interceptor(async () => unaryResponse())(unaryRequest("shop.Cart", "AddItem")),
    ).resolves.toMatchObject({ stream: false })

    // A stream is fully consumed despite the per-message and close observations throwing.
    async function* messages() {
      yield 1
      yield 2
    }
    const response = await interceptor(async () => streamResponse(messages()))(
      streamRequest("shop.Cart", "Watch"),
    )
    const received: unknown[] = []
    for await (const message of (response as { message: AsyncIterable<unknown> }).message) {
      received.push(message)
    }
    expect(received).toEqual([1, 2])
  })

  it("still executes a unary call when the diagnostics clock throws", async () => {
    const { interceptor } = createConnectSource({
      instance: "api",
      now: () => {
        throw new Error("clock down")
      },
    })
    let called = false
    const response = await interceptor(async () => {
      called = true
      return unaryResponse()
    })(unaryRequest("shop.Cart", "AddItem"))

    expect(called).toBe(true)
    expect(response.stream).toBe(false)
  })

  it("settles unary bookkeeping when the diagnostics clock fails after the call", async () => {
    let failClock = false
    const { port, interceptor } = setup({
      instance: "api",
      now: () => {
        if (failClock) throw new Error("clock down")
        return 1
      },
    })
    const next: Next = async () => {
      failClock = true
      return unaryResponse()
    }
    const response = await interceptor(next)(unaryRequest("shop.Cart", "AddItem"))

    expect(response.stream).toBe(false)
    failClock = false
    await interceptor(async () => unaryResponse())(unaryRequest("shop.Cart", "GetItem"))
    const indicator = port.snapshot().indicators.find((entry) => entry.indicator.id === "rpc")
    expect(indicator?.indicator.value).not.toContain("in flight")
  })

  it("classifies an idle-timeout stream return as timeout", async () => {
    const { port, interceptor } = setup({ instance: "api", messageIntervalMs: 0 })
    const controller = new AbortController()
    const request = {
      ...(streamRequest("shop.Feed", "Watch") as object),
      signal: controller.signal,
    } as Req
    async function* messages() {
      yield 1
      yield 2
    }
    const response = await interceptor(async () => streamResponse(messages()))(request)
    const iterator = (response as { message: AsyncIterable<unknown> }).message[
      Symbol.asyncIterator
    ]()
    await iterator.next()
    controller.abort(new TimeoutError(100))
    await iterator.return?.()

    const events = eventsOf(port)
    const close = events.find((event) => event.kind === "rpc.stream.timeout")
    expect(events.map((event) => event.kind)).toContain("rpc.stream.timeout")
    expect(close?.summary).toMatchObject({ outcome: "timeout", code: "deadline_exceeded" })
  })

  it("keeps a stream consumable when diagnostics timing fails after opening", async () => {
    let clockCalls = 0
    const { interceptor } = createConnectSource({
      instance: "api",
      messageIntervalMs: 1,
      now: () => {
        clockCalls += 1
        if (clockCalls > 1) throw new Error("clock down")
        return 1
      },
    })
    async function* messages() {
      yield 1
      yield 2
    }
    const response = await interceptor(async () => streamResponse(messages()))(
      streamRequest("shop.Cart", "Watch"),
    )
    const received: unknown[] = []
    for await (const message of (response as { message: AsyncIterable<unknown> }).message) {
      received.push(message)
    }
    expect(received).toEqual([1, 2])
  })
})
