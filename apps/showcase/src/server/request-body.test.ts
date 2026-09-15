import type { IncomingMessage } from "node:http"
import { Readable } from "node:stream"
import { describe, expect, test } from "vitest"
import {
  MAX_FORM_BODY_BYTES,
  PayloadTooLargeError,
  readRequestBody,
  resolveSigningKey,
} from "./request-body"

describe("resolveSigningKey", () => {
  test("uses environment key when valid and at least 32 characters", () => {
    const raw = "12345678901234567890123456789012"
    const key = resolveSigningKey(raw)
    expect(key).toEqual(new TextEncoder().encode(raw))
  })

  test("generates random 32-byte key when environment variable is unset or short", () => {
    const key1 = resolveSigningKey(undefined)
    const key2 = resolveSigningKey("short-key")
    expect(key1.byteLength).toBe(32)
    expect(key2.byteLength).toBe(32)
    expect(key1).not.toEqual(key2)
  })
})

describe("readRequestBody", () => {
  function createFakeRequest(chunks: (string | Buffer)[]): IncomingMessage {
    const buffers = chunks.map((c) => (typeof c === "string" ? Buffer.from(c) : c))
    const stream = Readable.from(buffers)
    return stream as unknown as IncomingMessage
  }

  test("reads request stream within byte limit", async () => {
    const req = createFakeRequest(["hello=", "world"])
    const body = await readRequestBody(req, 100)
    expect(body).toBe("hello=world")
  })

  test("destroys stream and throws PayloadTooLargeError when body exceeds maxBytes", async () => {
    const bigChunk = Buffer.alloc(100)
    const req = createFakeRequest([bigChunk])
    await expect(readRequestBody(req, 50)).rejects.toThrowError(PayloadTooLargeError)
    expect(req.destroyed).toBe(true)
  })

  test("default limit is MAX_FORM_BODY_BYTES", async () => {
    expect(MAX_FORM_BODY_BYTES).toBe(16 * 1024)
  })
})
