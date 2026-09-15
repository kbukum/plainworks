import type { IncomingMessage } from "node:http"

export const MAX_FORM_BODY_BYTES = 16 * 1024

export class PayloadTooLargeError extends Error {
  constructor() {
    super("Payload Too Large")
    this.name = "PayloadTooLargeError"
  }
}

export function resolveSigningKey(envKey = process.env.SESSION_SIGNING_KEY): Uint8Array {
  if (envKey !== undefined && envKey.length >= 32) {
    return new TextEncoder().encode(envKey)
  }
  const key = new Uint8Array(32)
  globalThis.crypto.getRandomValues(key)
  return key
}

export async function readRequestBody(
  req: IncomingMessage,
  maxBytes = MAX_FORM_BODY_BYTES,
): Promise<string> {
  const chunks: Buffer[] = []
  let bytesReceived = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytesReceived += buffer.length
    if (bytesReceived > maxBytes) {
      req.destroy()
      throw new PayloadTooLargeError()
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString("utf-8")
}
