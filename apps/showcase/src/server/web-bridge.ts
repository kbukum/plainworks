// The bridge between Node's HTTP server and the Web `Request`/`Response` the kit's BFF helpers
// speak. The dev server converts each auth request on the way in and writes the kit's response on
// the way out, so the showcase and the Next host run the same auth code.

import type { IncomingMessage, ServerResponse } from "node:http"
import { Readable } from "node:stream"
import type { WebRequest, WebResponse } from "@plainworks/std/web"

/**
 * Adapt a Node request to the kit's `WebRequest`. The body streams through unread, so the kit's
 * bounded readers decide how much of it to buffer. The signal aborts when the client disconnects
 * before the response ends.
 */
export function toWebRequest(
  req: IncomingMessage,
  res: ServerResponse,
  origin: string,
): WebRequest {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      headers.append(name, item)
    }
  }
  // A request's own `close` also fires on a normal end, so only a response that closes before it
  // ends means the client went away.
  const disconnect = new AbortController()
  res.once("close", () => {
    if (!res.writableEnded) {
      disconnect.abort()
    }
  })
  const method = req.method ?? "GET"
  const hasBody = method !== "GET" && method !== "HEAD"
  return {
    url: new URL(req.url ?? "/", origin).href,
    method,
    headers,
    body: hasBody ? Readable.toWeb(req) : null,
    signal: disconnect.signal,
  }
}

/** Write a Web `Response` to a Node response, sending each `Set-Cookie` as its own header. */
export async function sendWebResponse(res: ServerResponse, response: WebResponse): Promise<void> {
  res.statusCode = response.status
  const cookies: string[] = []
  for (const [name, value] of response.headers) {
    if (name === "set-cookie") {
      cookies.push(value)
    } else {
      res.setHeader(name, value)
    }
  }
  if (cookies.length > 0) {
    res.setHeader("set-cookie", cookies)
  }
  const body = response.body === null ? undefined : Buffer.from(await response.arrayBuffer())
  res.end(body)
}
