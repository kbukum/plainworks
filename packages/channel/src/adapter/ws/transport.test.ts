import type { AuthHeaders } from "@plainworks/std"
import { flushMicrotasks, manualDelay } from "@plainworks/testkit"
import { describe, expect, test } from "vitest"
import { ChannelError } from "../../error"
import type { ChannelFrame, TransportContext } from "../../transport"
import { SOCKET_OPEN, type WebSocketConnectInit, type WebSocketLike } from "./socket"
import { createWsTransport } from "./transport"

/** A drivable fake socket capturing the transport's wiring and letting a test emit lifecycle events. */
class FakeSocket implements WebSocketLike {
  readyState = SOCKET_OPEN
  binaryType = "blob"
  onopen: (() => void) | null = null
  onmessage: ((event: { readonly data: unknown }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onclose:
    | ((event: {
        readonly code: number
        readonly reason: string
        readonly wasClean: boolean
      }) => void)
    | null = null
  readonly sent: string[] = []
  closed?: { code?: number | undefined; reason?: string | undefined }

  constructor(
    readonly url: string,
    readonly init: WebSocketConnectInit,
  ) {}

  send(data: string): void {
    this.sent.push(data)
  }
  close(code?: number, reason?: string): void {
    this.closed = { code, reason }
    this.readyState = 3
  }
  open(): void {
    this.onopen?.()
  }
  message(data: unknown): void {
    this.onmessage?.({ data })
  }
  error(): void {
    this.onerror?.(new Error("boom"))
  }
  end(wasClean: boolean, code = wasClean ? 1000 : 1006): void {
    this.onclose?.({ code, reason: "", wasClean })
  }
}

function collect(lastEventId?: string) {
  const frames: ChannelFrame[] = []
  let opened = 0
  const controller = new AbortController()
  const context: TransportContext = {
    headers: { authorization: "Bearer t" } as AuthHeaders,
    signal: controller.signal,
    lastEventId,
    onOpen: () => {
      opened++
    },
    onFrame: (frame) => {
      frames.push(frame)
    },
  }
  return {
    context,
    controller,
    frames,
    get opened() {
      return opened
    },
  }
}

describe("createWsTransport", () => {
  test("opens, forwards messages as frames, and resolves on a clean close", async () => {
    const h = collect()
    let socket: FakeSocket | undefined
    const transport = createWsTransport({
      url: "wss://example.test/ws",
      socketFactory: (url, init) => {
        socket = new FakeSocket(url, init)
        return socket
      },
    })()

    const done = transport.open(h.context)
    await Promise.resolve()

    socket?.open()
    socket?.message("hello")
    socket?.message("world")
    socket?.end(true)

    await done
    expect(h.opened).toBe(1)
    expect(h.frames).toEqual([
      { type: "message", data: "hello" },
      { type: "message", data: "world" },
    ])
    expect(socket?.init.headers).toEqual({ authorization: "Bearer t" })
  })

  test("decodes a binary frame to text", async () => {
    const h = collect()
    let socket: FakeSocket | undefined
    const transport = createWsTransport({
      url: "wss://example.test/ws",
      socketFactory: (url, init) => {
        socket = new FakeSocket(url, init)
        return socket
      },
    })()

    const done = transport.open(h.context)
    await Promise.resolve()
    socket?.open()
    socket?.message(new Uint8Array([98, 105, 110, 97, 114, 121]))
    socket?.end(true)

    await done
    expect(h.frames[0]?.data).toBe("binary")
  })

  test("rejects with a connect error on a socket error", async () => {
    const h = collect()
    let socket: FakeSocket | undefined
    const transport = createWsTransport({
      url: "wss://example.test/ws",
      socketFactory: (url, init) => {
        socket = new FakeSocket(url, init)
        return socket
      },
    })()

    const done = transport.open(h.context)
    await Promise.resolve()
    socket?.error()

    await expect(done).rejects.toMatchObject({ kind: "channel/connect" })
    // The failed socket is closed so a reconnect never leaves it open with detached handlers.
    expect(socket?.closed).toBeDefined()
  })

  test("rejects on an unclean close", async () => {
    const h = collect()
    let socket: FakeSocket | undefined
    const transport = createWsTransport({
      url: "wss://example.test/ws",
      socketFactory: (url, init) => {
        socket = new FakeSocket(url, init)
        return socket
      },
    })()

    const done = transport.open(h.context)
    await Promise.resolve()
    socket?.open()
    socket?.end(false)

    await expect(done).rejects.toMatchObject({ kind: "channel/connect" })
  })

  test("never opens a socket when the attempt aborts while the endpoint resolves", async () => {
    const h = collect()
    let constructed = 0
    const transport = createWsTransport({
      url: () => {
        // Endpoint discovery resolves only after the attempt was already aborted.
        h.controller.abort(new Error("closed"))
        return "wss://example.test/ws"
      },
      socketFactory: (url, init) => {
        constructed++
        return new FakeSocket(url, init)
      },
    })()

    await expect(transport.open(h.context)).rejects.toThrow("closed")
    expect(constructed).toBe(0)
  })

  test("closes the socket and rejects when the attempt is aborted", async () => {
    const h = collect()
    let socket: FakeSocket | undefined
    const transport = createWsTransport({
      url: "wss://example.test/ws",
      socketFactory: (url, init) => {
        socket = new FakeSocket(url, init)
        return socket
      },
    })()

    const done = transport.open(h.context)
    await Promise.resolve()
    socket?.open()
    h.controller.abort(new Error("timeout"))

    await expect(done).rejects.toThrow("timeout")
    expect(socket?.closed).toBeDefined()
  })

  test("sends a heartbeat ping on each interval while open", async () => {
    const h = collect()
    const clock = manualDelay()
    let socket: FakeSocket | undefined
    const transport = createWsTransport({
      url: "wss://example.test/ws",
      heartbeat: { intervalMs: 5_000, message: "keepalive" },
      delay: clock.delay,
      socketFactory: (url, init) => {
        socket = new FakeSocket(url, init)
        return socket
      },
    })()

    const done = transport.open(h.context)
    await Promise.resolve()
    socket?.open()
    await flushMicrotasks()

    clock.fireWhere((ms) => ms === 5_000)
    await flushMicrotasks()
    clock.fireWhere((ms) => ms === 5_000)
    await flushMicrotasks()
    expect(socket?.sent).toEqual(["keepalive", "keepalive"])

    socket?.end(true)
    await done
  })

  test("sets binaryType to arraybuffer so binary frames never arrive as an undecodable Blob", async () => {
    const h = collect()
    let socket: FakeSocket | undefined
    const transport = createWsTransport({
      url: "wss://example.test/ws",
      socketFactory: (url, init) => {
        socket = new FakeSocket(url, init)
        return socket
      },
    })()

    const done = transport.open(h.context)
    await Promise.resolve()
    expect(socket?.binaryType).toBe("arraybuffer")
    socket?.end(true)
    await done
  })

  test("rejects an undecodable frame with a protocol error instead of corrupting it", async () => {
    const h = collect()
    let socket: FakeSocket | undefined
    const transport = createWsTransport({
      url: "wss://example.test/ws",
      socketFactory: (url, init) => {
        socket = new FakeSocket(url, init)
        return socket
      },
    })()

    const done = transport.open(h.context)
    await Promise.resolve()
    socket?.open()
    // A non-text/non-ArrayBuffer frame (e.g. a Blob from a socket that ignored binaryType) must
    // fail, not stringify.
    socket?.message({ raw: "x" })

    await expect(done).rejects.toMatchObject({ kind: "channel/protocol" })
    expect(h.frames).toEqual([])
  })

  test("rejects an invalid heartbeat interval at construction", () => {
    expect(() =>
      createWsTransport({ url: "wss://example.test/ws", heartbeat: { intervalMs: -1 } }),
    ).toThrow(ChannelError)
    // Zero would spin the send loop as fast as the event loop permits.
    expect(() =>
      createWsTransport({ url: "wss://example.test/ws", heartbeat: { intervalMs: 0 } }),
    ).toThrow(ChannelError)
  })

  test("a heartbeat send failure (not a cancellation) fails the connection", async () => {
    const h = collect()
    const clock = manualDelay()
    let socket: FakeSocket | undefined
    const transport = createWsTransport({
      url: "wss://example.test/ws",
      heartbeat: { intervalMs: 5_000 },
      delay: clock.delay,
      socketFactory: (url, init) => {
        socket = new FakeSocket(url, init)
        socket.send = () => {
          throw new Error("send failed")
        }
        return socket
      },
    })()

    const done = transport.open(h.context)
    await Promise.resolve()
    socket?.open()
    await flushMicrotasks()
    clock.fireWhere((ms) => ms === 5_000)

    // A thrown send does not imply a later error/close event — the attempt must fail, not hang.
    await expect(done).rejects.toMatchObject({ kind: "channel/connect" })
    expect(socket?.closed).toBeDefined()
  })

  test("a heartbeat delay failure (not a cancellation) fails the connection", async () => {
    const h = collect()
    let socket: FakeSocket | undefined
    const transport = createWsTransport({
      url: "wss://example.test/ws",
      heartbeat: { intervalMs: 5_000 },
      delay: () => Promise.reject(new RangeError("bad interval")),
      socketFactory: (url, init) => {
        socket = new FakeSocket(url, init)
        return socket
      },
    })()

    const done = transport.open(h.context)
    await Promise.resolve()
    socket?.open()

    await expect(done).rejects.toMatchObject({ kind: "channel/connect" })
    expect(socket?.closed).toBeDefined()
  })

  test("skips a heartbeat tick when the socket is no longer open", async () => {
    const h = collect()
    const clock = manualDelay()
    let socket: FakeSocket | undefined
    const transport = createWsTransport({
      url: "wss://example.test/ws",
      heartbeat: { intervalMs: 5_000 },
      delay: clock.delay,
      socketFactory: (url, init) => {
        socket = new FakeSocket(url, init)
        return socket
      },
    })()

    const done = transport.open(h.context)
    await Promise.resolve()
    socket?.open()
    await flushMicrotasks()

    if (socket) {
      socket.readyState = 2 // CLOSING — not OPEN
    }
    clock.fireWhere((ms) => ms === 5_000)
    await flushMicrotasks()
    expect(socket?.sent).toEqual([])

    socket?.end(true)
    await done
  })

  test("sends the default ping payload when no message is configured", async () => {
    const h = collect()
    const clock = manualDelay()
    let socket: FakeSocket | undefined
    const transport = createWsTransport({
      url: "wss://example.test/ws",
      heartbeat: { intervalMs: 5_000 },
      delay: clock.delay,
      socketFactory: (url, init) => {
        socket = new FakeSocket(url, init)
        return socket
      },
    })()

    const done = transport.open(h.context)
    await Promise.resolve()
    socket?.open()
    await flushMicrotasks()
    clock.fireWhere((ms) => ms === 5_000)
    await flushMicrotasks()

    expect(socket?.sent).toEqual(["ping"])
    socket?.end(true)
    await done
  })
})
