import { AbortError, type WebReadableStreamDefaultReader, type WebResponse } from "@plainworks/std"
import { expect, test } from "vitest"
import { HttpError } from "../error"
import { createJsonCodec, jsonCodec } from "./json"

/** A minimal {@link WebResponse} whose body is driven by a hand-built reader, for stream-path tests. */
function streamResponse(
  reader: WebReadableStreamDefaultReader<Uint8Array>,
  status = 200,
): WebResponse {
  const response: WebResponse = {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: new Headers(),
    url: "https://api.test",
    redirected: false,
    bodyUsed: false,
    body: { getReader: () => reader, cancel: () => Promise.resolve() },
    clone: () => response,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    json: () => Promise.resolve(undefined),
    text: () => Promise.resolve(""),
  }
  return response
}

test("encodes a value as JSON with a JSON content type", () => {
  const encoded = jsonCodec.encode({ a: 1 })
  expect(encoded.body).toBe('{"a":1}')
  expect(encoded.contentType).toBe("application/json")
})

test("maps a cyclic value to a fatal encode error instead of throwing a raw TypeError", () => {
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  expect(() => jsonCodec.encode(cyclic)).toThrow(HttpError)
  try {
    jsonCodec.encode(cyclic)
    expect.unreachable("encode must throw on a cyclic value")
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError)
    expect((error as HttpError).kind).toBe("http/encode")
  }
})

test("maps a BigInt value to a fatal encode error", () => {
  expect(() => jsonCodec.encode({ n: 1n })).toThrow(HttpError)
})

test("maps a value that JSON.stringify renders as undefined to a fatal encode error", () => {
  expect(() => jsonCodec.encode(() => 1)).toThrowError(/not JSON-serializable/)
  try {
    jsonCodec.encode(Symbol("x"))
    expect.unreachable("encode must throw on a symbol")
  } catch (error) {
    expect((error as HttpError).kind).toBe("http/encode")
  }
})

test("decodes a JSON body", async () => {
  const response = new Response('{"ok":true}', { status: 200 })
  await expect(jsonCodec.decode(response)).resolves.toEqual({ ok: true })
})

test("treats a 204 and an empty body as undefined", async () => {
  await expect(jsonCodec.decode(new Response(null, { status: 204 }))).resolves.toBeUndefined()
  await expect(jsonCodec.decode(new Response("", { status: 200 }))).resolves.toBeUndefined()
})

test("wraps a malformed body in a fatal decode error", async () => {
  const response = new Response("{not json", { status: 200 })
  await expect(jsonCodec.decode(response)).rejects.toBeInstanceOf(HttpError)
  await expect(jsonCodec.decode(new Response("{still bad", { status: 200 }))).rejects.toMatchObject(
    {
      kind: "http/decode",
    },
  )
})

test("refuses a body larger than the configured maximum instead of buffering it", async () => {
  const codec = createJsonCodec({ maxBytes: 8 })
  const response = new Response(JSON.stringify({ value: "way too long to fit" }), { status: 200 })
  await expect(codec.decode(response)).rejects.toMatchObject({ kind: "http/decode" })
})

test("rejects an already-aborted read with a typed abort error instead of a silent empty body", async () => {
  const controller = new AbortController()
  controller.abort()
  const response = new Response('{"ok":true}', { status: 200 })
  await expect(jsonCodec.decode(response, controller.signal)).rejects.toBeInstanceOf(AbortError)
})

test("rejects a read aborted mid-stream with a typed abort error", async () => {
  const controller = new AbortController()
  let call = 0
  const reader: WebReadableStreamDefaultReader<Uint8Array> = {
    read: () => {
      call += 1
      if (call === 1) {
        // The abort lands after the first chunk is read but before the body completes.
        controller.abort()
        return Promise.resolve({ done: false, value: new Uint8Array([123]) })
      }
      return Promise.resolve({ done: true, value: undefined })
    },
    cancel: () => Promise.resolve(),
    releaseLock: () => {},
  }
  await expect(jsonCodec.decode(streamResponse(reader), controller.signal)).rejects.toBeInstanceOf(
    AbortError,
  )
})

test("maps a stream read fault to a retryable network error", async () => {
  const reader: WebReadableStreamDefaultReader<Uint8Array> = {
    read: () => Promise.reject(new Error("stream broke")),
    cancel: () => Promise.resolve(),
    releaseLock: () => {},
  }
  await expect(jsonCodec.decode(streamResponse(reader))).rejects.toMatchObject({
    kind: "http/network",
    retryable: true,
  })
})

test("rejects a non-positive or non-integer maxBytes at construction", () => {
  expect(() => createJsonCodec({ maxBytes: 0 })).toThrow(RangeError)
  expect(() => createJsonCodec({ maxBytes: -1 })).toThrow(RangeError)
  expect(() => createJsonCodec({ maxBytes: 1.5 })).toThrow(RangeError)
  expect(() => createJsonCodec({ maxBytes: Number.POSITIVE_INFINITY })).toThrow(RangeError)
  expect(() => createJsonCodec({ maxBytes: Number.NaN })).toThrow(RangeError)
})
