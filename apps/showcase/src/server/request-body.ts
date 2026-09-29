import type { IncomingMessage } from "node:http"
import { Readable } from "node:stream"
import { readBoundedText } from "@plainworks/std/web"

export const MAX_FORM_BODY_BYTES = 16 * 1024

export function resolveSigningKey(envKey = process.env.SESSION_SIGNING_KEY): Uint8Array {
  if (envKey !== undefined && envKey.length >= 32) {
    return new TextEncoder().encode(envKey)
  }
  const key = new Uint8Array(32)
  globalThis.crypto.getRandomValues(key)
  return key
}

/**
 * Read a Node request body as bounded UTF-8 text through std's reader. Past `maxBytes` it throws
 * std's `PayloadTooLargeError` and cancels the stream, which destroys the underlying socket read.
 */
export function readRequestBody(
  req: IncomingMessage,
  maxBytes = MAX_FORM_BODY_BYTES,
): Promise<string> {
  return readBoundedText(Readable.toWeb(req), { maxBytes })
}
