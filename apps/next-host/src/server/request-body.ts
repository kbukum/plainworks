import "server-only"

// Bounded body readers for the BFF route handlers. A Web `Request` body is an attacker-controlled
// stream, so every route that reads one caps it before buffering — the Next equivalent of the
// showcase's `readRequestBody` and the mock plugin's `maxBodyBytes`. An oversized body is drained
// no further than the cap and rejected with 413, so an unauthenticated caller can never force
// unbounded memory use ahead of authentication or CSRF checks.

/** Default cap for a forwarded mock-API body (1 MiB), matching the Vite host's `maxBodyBytes`. */
export const MAX_API_BODY_BYTES = 1024 * 1024

/** Default cap for a form/CSRF body (16 KiB), matching the showcase's logout reader. */
export const MAX_FORM_BODY_BYTES = 16 * 1024

/** A request body exceeded its byte cap; the route maps this to a 413 response. */
export class PayloadTooLargeError extends Error {
  constructor() {
    super("Payload Too Large")
    this.name = "PayloadTooLargeError"
  }
}

/** Drain a body stream into bytes, cancelling and throwing at `maxBytes` rather than buffering on. */
async function readBoundedBytes(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (body === null) {
    return new Uint8Array(0)
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      received += value.byteLength
      if (received > maxBytes) {
        await reader.cancel()
        throw new PayloadTooLargeError()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const out = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/** Read a request body as bounded UTF-8 text; throws {@link PayloadTooLargeError} past `maxBytes`. */
export async function readBoundedText(
  request: Request,
  maxBytes = MAX_FORM_BODY_BYTES,
): Promise<string> {
  return new TextDecoder().decode(await readBoundedBytes(request.body, maxBytes))
}

/**
 * Rebuild `request` with its body buffered under `maxBytes`, so a downstream handler reads a
 * bounded payload. GET/HEAD carry no body and pass through untouched; any other method's stream is
 * drained with a 413 cap before a fresh `Request` is assembled from the buffered bytes. The
 * caller's `signal` is carried over, so a disconnected client still aborts the downstream work.
 */
export async function boundedRequest(
  request: Request,
  maxBytes = MAX_API_BODY_BYTES,
): Promise<Request> {
  if (request.method === "GET" || request.method === "HEAD") {
    return request
  }
  const bytes = await readBoundedBytes(request.body, maxBytes)
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
    ...(bytes.byteLength > 0 ? { body: bytes } : {}),
  })
}

/** The shared 413 response a route returns when a body overruns its cap. */
export function payloadTooLarge(): Response {
  return new Response("Payload Too Large", { status: 413 })
}
