import "server-only"

// Body caps for the BFF route handlers. A Web `Request` body is an attacker-controlled stream, so
// every route that reads one caps it before buffering, through std's bounded readers. An oversized
// body is read no further than the cap and rejected with 413, so an unauthenticated caller can
// never force unbounded memory use ahead of authentication or CSRF checks.

import { readBoundedBytes, readBoundedText } from "@plainworks/std/web"

/** Default cap for a forwarded mock-API body (1 MiB), matching the Vite host's `maxBodyBytes`. */
export const MAX_API_BODY_BYTES = 1024 * 1024

/** Default cap for a form/CSRF body (16 KiB), matching the showcase's logout reader. */
export const MAX_FORM_BODY_BYTES = 16 * 1024

/**
 * Read a form body as bounded UTF-8 text. Throws std's `PayloadTooLargeError` past `maxBytes`, and
 * stops when the client disconnects.
 */
export function readFormBody(request: Request, maxBytes = MAX_FORM_BODY_BYTES): Promise<string> {
  return readBoundedText(request.body, { maxBytes, signal: request.signal })
}

/**
 * Rebuild `request` with its body buffered under `maxBytes`, so a downstream handler reads a
 * bounded payload. GET/HEAD carry no body and pass through untouched; any other method's stream is
 * read with a 413 cap before a fresh `Request` is assembled from the buffered bytes. The caller's
 * `signal` is carried over, so a disconnected client still aborts the downstream work.
 */
export async function boundedRequest(
  request: Request,
  maxBytes = MAX_API_BODY_BYTES,
): Promise<Request> {
  if (request.method === "GET" || request.method === "HEAD") {
    return request
  }
  const bytes = await readBoundedBytes(request.body, { maxBytes, signal: request.signal })
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
