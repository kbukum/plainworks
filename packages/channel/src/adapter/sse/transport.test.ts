import type {
  AuthHeaders,
  WebFetch,
  WebHeaders,
  WebRequestInit,
  WebResponse,
} from "@plainworks/std"
import { describe, expect, test } from "vitest"
import { ChannelError } from "../../error"
import type { ChannelFrame, TransportContext } from "../../transport"
import { createSseTransport } from "./transport"

/** A `WebResponse`-shaped SSE response whose body is the concatenated chunks. */
function sseResponse(chunks: readonly string[], init?: { status?: number; contentType?: string }) {
  const status = init?.status ?? 200
  return new Response(status === 204 ? null : chunks.join(""), {
    status,
    headers: { "content-type": init?.contentType ?? "text/event-stream" },
  })
}

/** A collecting {@link TransportContext} plus the fetch init the transport issued. */
function collect(options: { lastEventId?: string; headers?: AuthHeaders } = {}) {
  const frames: ChannelFrame[] = []
  const ids: string[] = []
  let opened = 0
  let seenInit: WebRequestInit | undefined
  const context: TransportContext = {
    headers: options.headers ?? ({} as AuthHeaders),
    signal: new AbortController().signal,
    lastEventId: options.lastEventId,
    onOpen: () => {
      opened++
    },
    onFrame: (frame) => {
      frames.push(frame)
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
    const frames: ChannelFrame[] = []
    const context: TransportContext = {
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
})
