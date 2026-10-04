import { AbortError } from "@plainworks/std/resilience"
import type { AuthHeaders, StreamFrame, StreamTransportContext } from "@plainworks/std/seam"
import type {
  WebAbortSignal,
  WebFetch,
  WebHeaders,
  WebReadableStream,
  WebReadableStreamDefaultReader,
  WebRequestInit,
  WebResponse,
} from "@plainworks/std/web"
import { deferred, flushMicrotasks } from "@plainworks/testkit"
import { describe, expect, test } from "vitest"
import { ChannelError } from "../errors"
import { createSseTransport } from "./sse"

test("SSE never automatically redirects credential-bearing requests", async () => {
  await createSseTransport({
    url: "https://events.test",
    fetch: async (_url, init) => {
      expect(init?.redirect).toBe("error")
      return sseResponse([])
    },
  })().open({
    signal: new AbortController().signal,
    headers: { "X-Custom-Proof": "proof" },
    onOpen() {},
    onFrame() {},
  })
})

test("a network failure while reading an open body remains retryable", async () => {
  const failure = new TypeError("connection reset")
  let released = false
  const body: WebReadableStream<Uint8Array> = {
    cancel: async () => {},
    getReader: () => ({
      read: async () => {
        throw failure
      },
      cancel: async () => {},
      releaseLock: () => {
        released = true
      },
    }),
  }
  const running = createSseTransport({
    url: "https://events.test",
    fetch: async () => ({ ...controlledBody().response(), body }),
  })().open({
    signal: new AbortController().signal,
    headers: {},
    onOpen() {},
    onFrame() {},
  })
  await expect(running).rejects.toMatchObject({
    kind: "channel/connect",
    retryable: true,
    cause: failure,
  })
  expect(released).toBe(true)
})

test.each(["abort", "overflow"])(
  "%s releases an SSE reader despite stalled cleanup",
  async (kind) => {
    const cleanup = deferred<void>()
    const body = controlledBody(cleanup.promise)
    if (kind === "overflow") body.push("data: too large")
    const controller = new AbortController()
    let settled = false
    const running = createSseTransport({
      url: "https://events.test",
      maxBufferChars: 8,
      fetch: async () => body.response(),
    })()
      .open({
        signal: controller.signal,
        headers: {},
        onOpen() {},
        onFrame() {},
      })
      .catch((error: unknown) => {
        settled = true
        expect(error).toBeInstanceOf(kind === "abort" ? AbortError : ChannelError)
      })
    await flushMicrotasks()
    controller.abort()
    await flushMicrotasks()
    const settledBeforeCleanup = settled
    const releasedBeforeCleanup = !body.locked
    cleanup.resolve()
    await running
    expect(settledBeforeCleanup).toBe(true)
    expect(releasedBeforeCleanup).toBe(true)
  },
)

/** A `WebResponse`-shaped SSE response whose body is the concatenated chunks. */
function sseResponse(chunks: readonly string[], init?: { status?: number; contentType?: string }) {
  const status = init?.status ?? 200
  return new Response(status === 204 ? null : chunks.join(""), {
    status,
    headers: { "content-type": init?.contentType ?? "text/event-stream" },
  })
}

type ReadResult = Awaited<ReturnType<WebReadableStreamDefaultReader<Uint8Array>["read"]>>

/**
 * An SSE body the test feeds chunk by chunk. Like a platform stream, `cancel` settles a pending
 * read as done and only the first cancel reaches the source, so `cancelReasons` shows what the
 * transport cancelled with and `locked` whether it released the reader.
 */
function controlledBody(cleanup?: Promise<void>) {
  const encoder = new TextEncoder()
  const chunks: ReadResult[] = []
  const pending: Array<(result: ReadResult) => void> = []
  const cancelReasons: unknown[] = []
  let finished = false
  let locked = false
  const settle = (result: ReadResult): void => {
    const next = pending.shift()
    if (next) {
      next(result)
    } else {
      chunks.push(result)
    }
  }
  const finish = (): void => {
    finished = true
    for (const next of pending.splice(0)) {
      next({ done: true })
    }
  }
  const reader: WebReadableStreamDefaultReader<Uint8Array> = {
    read: () => {
      const next = chunks.shift()
      if (next) {
        return Promise.resolve(next)
      }
      if (finished) {
        return Promise.resolve({ done: true })
      }
      return new Promise((resolve) => pending.push(resolve))
    },
    cancel: async (reason) => {
      if (!finished) {
        cancelReasons.push(reason)
        chunks.length = 0
        finish()
        await cleanup
      }
    },
    releaseLock: () => {
      locked = false
    },
  }
  const body: WebReadableStream<Uint8Array> = {
    getReader: () => {
      locked = true
      return reader
    },
    cancel: (reason) => reader.cancel(reason),
  }
  const response: WebResponse = {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "text/event-stream" }),
    url: "https://example.test/stream",
    redirected: false,
    bodyUsed: false,
    body,
    clone: () => response,
    arrayBuffer: () => Promise.reject(new Error("not used")),
    json: () => Promise.reject(new Error("not used")),
    text: () => Promise.reject(new Error("not used")),
  }
  return {
    cancelReasons,
    get locked() {
      return locked
    },
    response: () => response,
    push: (text: string) => settle({ done: false, value: encoder.encode(text) }),
    end: () => {
      settle({ done: true })
      finished = true
    },
  }
}

/** A collecting {@link StreamTransportContext} plus the fetch init the transport issued. */
function collect(
  options: {
    lastEventId?: string
    headers?: AuthHeaders
    signal?: WebAbortSignal
    onFrame?: (frame: StreamFrame) => void
  } = {},
) {
  const frames: StreamFrame[] = []
  const ids: string[] = []
  let opened = 0
  let seenInit: WebRequestInit | undefined
  const context: StreamTransportContext = {
    headers: options.headers ?? ({} as AuthHeaders),
    signal: options.signal ?? new AbortController().signal,
    lastEventId: options.lastEventId,
    onOpen: () => {
      opened++
    },
    onFrame: (frame) => {
      frames.push(frame)
      options.onFrame?.(frame)
    },
    onId: (id) => {
      ids.push(id)
    },
  }
  return {
    context,
    frames,
    ids,
    get opened() {
      return opened
    },
    get init() {
      return seenInit
    },
    fetchWith(fetchImpl: (init: WebRequestInit | undefined) => WebResponse): WebFetch {
      return (_input, init) => {
        seenInit = init
        return Promise.resolve(fetchImpl(init))
      }
    },
  }
}

describe("createSseTransport", () => {
  test("decodes event-stream frames and opens before the first frame", async () => {
    const h = collect()
    const transport = createSseTransport({
      url: "https://example.test/stream",
      fetch: h.fetchWith(() =>
        sseResponse(["event: ping\ndata: hello\nid: 1\n\n", "data: world\n\n"]),
      ),
    })()

    await transport.open(h.context)

    expect(h.opened).toBe(1)
    expect(h.frames).toEqual([
      { type: "ping", data: "hello", id: "1", retry: undefined },
      { type: "message", data: "world", id: undefined, retry: undefined },
    ])
  })

  test("reports id-only blocks and empty-id resets via onId without emitting frames", async () => {
    const h = collect()
    const transport = createSseTransport({
      url: "https://example.test/stream",
      fetch: h.fetchWith(() =>
        sseResponse(["data: a\nid: e1\n\n", "id: cursor-9\n\n", "id:\n\n", "data: b\n\n"]),
      ),
    })()

    await transport.open(h.context)

    // The id-only block and the empty-id reset move the cursor but deliver no frame.
    expect(h.ids).toEqual(["e1", "cursor-9", ""])
    expect(h.frames).toEqual([
      { type: "message", data: "a", id: "e1", retry: undefined },
      { type: "message", data: "b", id: undefined, retry: undefined },
    ])
  })

  test("carries the server retry hint onto the next frame", async () => {
    const h = collect()
    const transport = createSseTransport({
      url: "https://example.test/stream",
      fetch: h.fetchWith(() => sseResponse(["retry: 2500\ndata: x\n\n"])),
    })()

    await transport.open(h.context)

    expect(h.frames[0]?.retry).toBe(2500)
  })

  test("sends SSE protocol headers, merges channel headers, and resumes by header only", async () => {
    const h = collect({ lastEventId: "id-42", headers: { authorization: "cred-1" } })
    const transport = createSseTransport({
      url: "https://example.test/stream",
      fetch: h.fetchWith(() => sseResponse(["data: x\n\n"])),
    })()

    await transport.open(h.context)

    const headers = h.init?.headers as WebHeaders
    expect(headers.get("Accept")).toBe("text/event-stream")
    expect(headers.get("Cache-Control")).toBe("no-cache")
    expect(headers.get("authorization")).toBe("cred-1")
    expect(headers.get("Last-Event-ID")).toBe("id-42")
  })

  test("accepts case variants of the media type with parameters", async () => {
    const h = collect()
    const transport = createSseTransport({
      url: "https://example.test/stream",
      fetch: h.fetchWith(() =>
        sseResponse(["data: x\n\n"], { contentType: "Text/Event-Stream; charset=utf-8" }),
      ),
    })()

    await transport.open(h.context)
    expect(h.frames).toHaveLength(1)
  })

  test("rejects a lookalike media type that merely contains the essence", async () => {
    const h = collect()
    const transport = createSseTransport({
      url: "https://example.test/stream",
      fetch: h.fetchWith(() =>
        sseResponse(["data: x\n\n"], { contentType: "application/text/event-stream+json" }),
      ),
    })()

    await expect(transport.open(h.context)).rejects.toMatchObject({
      kind: "channel/protocol",
    })
  })

  test("rejects a non-2xx response with a protocol error carrying the status", async () => {
    const h = collect()
    const transport = createSseTransport({
      url: "https://example.test/stream",
      fetch: h.fetchWith(() => sseResponse([], { status: 401 })),
    })()

    await expect(transport.open(h.context)).rejects.toMatchObject({
      kind: "channel/protocol",
      status: 401,
    })
    expect(h.opened).toBe(0)
  })

  test("rejects a wrong content-type", async () => {
    const h = collect()
    const transport = createSseTransport({
      url: "https://example.test/stream",
      fetch: h.fetchWith(() => sseResponse(["data: x\n\n"], { contentType: "application/json" })),
    })()

    await expect(transport.open(h.context)).rejects.toBeInstanceOf(ChannelError)
  })

  test("bounds the decode buffer and ends with a protocol error on overflow", async () => {
    const h = collect()
    const flood = `data: ${"x".repeat(200)}\n`
    const transport = createSseTransport({
      url: "https://example.test/stream",
      maxBufferChars: 64,
      fetch: h.fetchWith(() => sseResponse([flood, flood, flood])),
    })()

    await expect(transport.open(h.context)).rejects.toMatchObject({ kind: "channel/protocol" })
  })

  test("rejects a response with no readable body", async () => {
    const h = collect()
    const transport = createSseTransport({
      url: "https://example.test/stream",
      fetch: h.fetchWith(
        () => new Response(null, { status: 200, headers: { "content-type": "text/event-stream" } }),
      ),
    })()

    await expect(transport.open(h.context)).rejects.toMatchObject({ kind: "channel/protocol" })
  })

  test("rethrows the signal reason when the attempt is aborted during fetch", async () => {
    const controller = new AbortController()
    const frames: StreamFrame[] = []
    const context: StreamTransportContext = {
      headers: {} as AuthHeaders,
      signal: controller.signal,
      onOpen: () => {},
      onFrame: (frame) => frames.push(frame),
    }
    const reason = new Error("connect timeout")
    const transport = createSseTransport({
      url: "https://example.test/stream",
      fetch: () => {
        controller.abort(reason)
        return Promise.reject(reason)
      },
    })()

    await expect(transport.open(context)).rejects.toBe(reason)
  })

  test("wraps a fetch failure as a retryable connect error", async () => {
    const h = collect()
    const transport = createSseTransport({
      url: "https://example.test/stream",
      fetch: () => Promise.reject(new TypeError("network down")),
    })()

    await expect(transport.open(h.context)).rejects.toMatchObject({ kind: "channel/connect" })
  })

  test("resolves the url from a provider on each attempt", async () => {
    const h = collect()
    let resolved = ""
    const transport = createSseTransport({
      url: () => "https://example.test/signed",
      fetch: (input, init) => {
        resolved = String(input)
        return h.fetchWith(() => sseResponse(["data: x\n\n"]))(input, init)
      },
    })()

    await transport.open(h.context)

    expect(resolved).toBe("https://example.test/signed")
    expect(h.frames).toHaveLength(1)
  })

  describe("stream ownership", () => {
    test("releases the reader without cancelling after a clean end", async () => {
      const stream = controlledBody()
      const h = collect()
      const transport = createSseTransport({
        url: "https://example.test/stream",
        fetch: h.fetchWith(stream.response),
      })()
      stream.push("data: a\n\n")
      stream.end()

      await transport.open(h.context)

      expect(h.frames).toHaveLength(1)
      expect(stream.cancelReasons).toEqual([])
      expect(stream.locked).toBe(false)
    })

    test("cancels and releases the reader when aborted mid-stream", async () => {
      const stream = controlledBody()
      const controller = new AbortController()
      const reason = new Error("closed by caller")
      const h = collect({ signal: controller.signal, onFrame: () => controller.abort(reason) })
      const transport = createSseTransport({
        url: "https://example.test/stream",
        fetch: h.fetchWith(stream.response),
      })()
      stream.push("data: a\n\n")

      const error = await transport.open(h.context).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(AbortError)
      expect((error as AbortError).cause).toBe(reason)
      expect(stream.cancelReasons).toEqual([reason])
      expect(stream.locked).toBe(false)
    })

    test("cancels a body that is already aborted when the stream opens", async () => {
      const stream = controlledBody()
      const controller = new AbortController()
      const h = collect({ signal: controller.signal })
      const context = { ...h.context, onOpen: () => controller.abort() }
      const transport = createSseTransport({
        url: "https://example.test/stream",
        fetch: h.fetchWith(stream.response),
      })()

      await expect(transport.open(context)).rejects.toBeInstanceOf(AbortError)
      expect(stream.cancelReasons).toHaveLength(1)
      expect(stream.locked).toBe(false)
    })

    test("cancels and releases the reader when the consumer throws", async () => {
      const stream = controlledBody()
      const failure = new Error("consumer failed")
      const h = collect({
        onFrame: () => {
          throw failure
        },
      })
      const transport = createSseTransport({
        url: "https://example.test/stream",
        fetch: h.fetchWith(stream.response),
      })()
      stream.push("data: a\n\n")

      await expect(transport.open(h.context)).rejects.toBe(failure)
      expect(stream.cancelReasons).toEqual([failure])
      expect(stream.locked).toBe(false)
    })

    test("cancels and releases the reader when a frame overflows the buffer", async () => {
      const stream = controlledBody()
      const h = collect()
      const transport = createSseTransport({
        url: "https://example.test/stream",
        maxBufferChars: 8,
        fetch: h.fetchWith(stream.response),
      })()
      stream.push(`data: ${"x".repeat(64)}`)

      const error = await transport.open(h.context).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(ChannelError)
      expect(stream.cancelReasons).toEqual([error])
      expect(stream.locked).toBe(false)
    })
  })
})
