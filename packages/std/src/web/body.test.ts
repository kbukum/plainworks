import { describe, expect, test, vi } from "vitest"
import { NetworkError } from "../resilience/classify"
import { AbortError } from "../resilience/timeout"
import { PayloadTooLargeError, readBoundedBytes, readBoundedText } from "./body"
import type { WebReadableStream, WebReadableStreamDefaultReader } from "./types"

const encoder = new TextEncoder()

/** A body stream that yields `chunks` in order and records cancellation and lock release. */
function chunkedBody(chunks: readonly Uint8Array[]) {
  const queue = [...chunks]
  const reader = {
    read: vi.fn(async () => {
      const value = queue.shift()
      return value === undefined ? { done: true as const } : { done: false as const, value }
    }),
    cancel: vi.fn(async () => {}),
    releaseLock: vi.fn(),
  } satisfies WebReadableStreamDefaultReader<Uint8Array>
  const body = {
    getReader: () => reader,
    cancel: vi.fn(async () => {}),
  } satisfies WebReadableStream<Uint8Array>
  return { body, reader }
}

describe("readBoundedBytes", () => {
  test("concatenates every chunk under the cap", async () => {
    const { body, reader } = chunkedBody([encoder.encode("ab"), encoder.encode("cd")])
    const bytes = await readBoundedBytes(body, { maxBytes: 4 })
    expect(new TextDecoder().decode(bytes)).toBe("abcd")
    expect(reader.releaseLock).toHaveBeenCalledOnce()
  })

  test("reads a missing body as no bytes", async () => {
    expect((await readBoundedBytes(null, { maxBytes: 1 })).byteLength).toBe(0)
  })

  test("cancels the stream and throws a typed error past the cap", async () => {
    const { body, reader } = chunkedBody([encoder.encode("abc"), encoder.encode("de")])
    const read = readBoundedBytes(body, { maxBytes: 4 })
    await expect(read).rejects.toBeInstanceOf(PayloadTooLargeError)
    await expect(read).rejects.toMatchObject({ kind: "std/payload-too-large", maxBytes: 4 })
    expect(reader.cancel).toHaveBeenCalledOnce()
    expect(reader.read).toHaveBeenCalledTimes(2)
  })

  test("rejects an already-aborted signal without reading, and cancels the body", async () => {
    const { body, reader } = chunkedBody([encoder.encode("a")])
    const controller = new AbortController()
    controller.abort("gone")
    await expect(
      readBoundedBytes(body, { maxBytes: 4, signal: controller.signal }),
    ).rejects.toMatchObject({ kind: "std/aborted", cause: "gone" })
    expect(body.cancel).toHaveBeenCalledOnce()
    expect(reader.read).not.toHaveBeenCalled()
  })

  test("rejects with a typed abort when the signal fires mid-read", async () => {
    const controller = new AbortController()
    const reader = {
      read: vi.fn(
        () =>
          new Promise<{ done: true }>((_resolve, reject) => {
            controller.signal.addEventListener("abort", () => reject(new Error("cancelled")))
          }),
      ),
      cancel: vi.fn(async () => {}),
      releaseLock: vi.fn(),
    }
    const body = { getReader: () => reader, cancel: async () => {} }
    const read = readBoundedBytes(body, { maxBytes: 4, signal: controller.signal })
    controller.abort("stop")
    await expect(read).rejects.toBeInstanceOf(AbortError)
    expect(reader.cancel).toHaveBeenCalled()
    expect(reader.releaseLock).toHaveBeenCalledOnce()
  })

  test("rejects with a typed abort when a read settles with data after the signal fired", async () => {
    const controller = new AbortController()
    const reader = {
      // The chunk arrives only after the abort, so a partial body must not be returned.
      read: vi.fn(async () => {
        controller.abort("late")
        return { done: false as const, value: encoder.encode("a") }
      }),
      cancel: vi.fn(async () => {}),
      releaseLock: vi.fn(),
    }
    const read = readBoundedBytes(
      { getReader: () => reader, cancel: async () => {} },
      { maxBytes: 4, signal: controller.signal },
    )
    await expect(read).rejects.toMatchObject({ kind: "std/aborted", cause: "late" })
    expect(reader.read).toHaveBeenCalledOnce()
    expect(reader.releaseLock).toHaveBeenCalledOnce()
  })

  test("wraps a stream fault in a typed network error that keeps the cause", async () => {
    const fault = new Error("stream broke")
    const reader = {
      read: () => Promise.reject(fault),
      cancel: async () => {},
      releaseLock: vi.fn(),
    }
    const read = readBoundedBytes(
      { getReader: () => reader, cancel: async () => {} },
      {
        maxBytes: 4,
      },
    )
    await expect(read).rejects.toBeInstanceOf(NetworkError)
    await expect(read).rejects.toMatchObject({ cause: fault })
    expect(reader.releaseLock).toHaveBeenCalledOnce()
  })

  test.each([0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN])(
    "rejects the invalid cap %s before reading",
    async (maxBytes) => {
      const { reader, body } = chunkedBody([])
      await expect(readBoundedBytes(body, { maxBytes })).rejects.toBeInstanceOf(RangeError)
      expect(reader.read).not.toHaveBeenCalled()
    },
  )
})

describe("readBoundedText", () => {
  test("decodes UTF-8 split across chunk boundaries", async () => {
    const euro = encoder.encode("€")
    const { body } = chunkedBody([encoder.encode("price "), euro.slice(0, 1), euro.slice(1)])
    expect(await readBoundedText(body, { maxBytes: 64 })).toBe("price €")
  })

  test("counts bytes, not characters, against the cap", async () => {
    const { body } = chunkedBody([encoder.encode("€€")])
    await expect(readBoundedText(body, { maxBytes: 5 })).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    )
  })

  test("reads a real Response body", async () => {
    expect(await readBoundedText(new Response("hello").body, { maxBytes: 5 })).toBe("hello")
  })
})
