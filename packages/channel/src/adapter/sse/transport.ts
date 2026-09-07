// The neutral (`.`) SSE transport: `fetch` + `Response.body` + `eventsource-parser`, never the DOM `EventSource` (which cannot attach an `Authorization` header — the reason this kit streams over `fetch`). It implements one attempt of the transport seam; reconnect/backoff/timeouts live in the channel core. Runs anywhere `fetch` and `TextDecoder` exist (Node, edge, workers, browser).
import type { WebFetch, WebReadableStream, WebResponse } from "@plainworks/std"
import { createParser } from "eventsource-parser"
import { ChannelError } from "../../error"
import type { Transport, TransportContext, TransportFactory } from "../../transport"
import { resolveUrl, type UrlSource } from "../url"

const DEFAULT_MAX_BUFFER_CHARS = 1_048_576

/** Construction options for {@link createSseTransport}. */
export interface SseTransportOptions {
  /** The SSE endpoint — a string, or a provider re-resolved on every attempt (never carries a token). */
  readonly url: UrlSource
  /** Injected `fetch`; defaults to the global `fetch`. Streaming requires a real streamed `Response`. */
  readonly fetch?: WebFetch
  /**
   * Bound (in characters) on the parser's retained partial line and accumulated multi-line event, guarding against a server streaming an unbounded frame with no delimiter (a memory-exhaustion vector). Exceeding it ends the connection with a protocol error. Default 1,048,576 characters.
   */
  readonly maxBufferChars?: number
}

/**
 * A pluggable SSE {@link TransportFactory} for {@link createChannel}. Each attempt issues one `GET` with the channel's resolved headers plus the SSE protocol headers (`Accept: text/event-stream`, `Cache-Control: no-cache`, and header-only `Last-Event-ID` resume), verifies the response is an `ok` event stream, signals `onOpen`, then pulls the body one chunk at a time — pull-based backpressure, no unbounded internal queue — decoding frames to `onFrame`.
 */
export function createSseTransport(options: SseTransportOptions): TransportFactory {
  const { url, maxBufferChars = DEFAULT_MAX_BUFFER_CHARS } = options
  // A non-integer/overflowing bound (e.g. Infinity) would make the parser's size check permanently pass, defeating the memory bound — reject it at construction.
  if (!Number.isSafeInteger(maxBufferChars) || maxBufferChars < 1) {
    throw ChannelError.config("maxBufferChars must be a safe integer >= 1")
  }
  const fetchImpl = options.fetch ?? resolveGlobalFetch()

  return (): Transport => ({
    async open(context: TransportContext): Promise<void> {
      const endpoint = await resolveUrl(url, context.signal)
      const headers = new Headers()
      headers.set("Accept", "text/event-stream")
      headers.set("Cache-Control", "no-cache")
      for (const [key, value] of Object.entries(context.headers)) {
        headers.set(key, value)
      }
      if (context.lastEventId !== undefined) {
        // Header-only resume — the id is NEVER placed in the URL/query string.
        headers.set("Last-Event-ID", context.lastEventId)
      }

      let response: WebResponse
      try {
        response = await fetchImpl(endpoint, { method: "GET", headers, signal: context.signal })
      } catch (cause) {
        if (context.signal.aborted) {
          // The core aborted the attempt (connect/idle timeout or close); it owns the settled outcome.
          throw cause
        }
        throw ChannelError.connect("channel connection failed", { cause })
      }

      if (!response.ok) {
        // `status` lets the shared classifier stop reconnection on a `401`/`403` and retry a `5xx`.
        throw ChannelError.protocol(`channel endpoint returned HTTP ${response.status}`, {
          status: response.status,
        })
      }
      // Compare the normalized media-type essence (parameters ignored) — a substring match would
      // accept lookalikes like `application/text/event-stream+json` and miss case variants.
      const contentType = response.headers.get("content-type") ?? ""
      const essence = contentType.split(";").at(0)?.trim().toLowerCase() ?? ""
      if (essence !== "text/event-stream") {
        throw ChannelError.protocol(`unexpected content-type "${contentType}"`, {
          status: response.status,
        })
      }
      if (response.body === null) {
        throw ChannelError.protocol("channel response had no readable body")
      }

      context.onOpen()
      await readEventStream(response.body, context, maxBufferChars)
    },
  })
}

/** Pull the body one chunk at a time and dispatch each decoded SSE frame; resolve on clean EOF. */
async function readEventStream(
  body: WebReadableStream<Uint8Array>,
  context: TransportContext,
  maxBufferChars: number,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let pendingRetry: number | undefined
  let overflow: ChannelError | undefined
  const parser = createParser({
    // Fires for every block carrying an `id` field — including id-only blocks that emit no event — so the resume cursor never goes stale. An empty id resets the cursor.
    onId: (id) => {
      context.onId?.(id)
    },
    onEvent: (event) => {
      // `event` is undefined for a default `message` (unlike the browser `EventSource`).
      context.onFrame({
        type: event.event ?? "message",
        data: event.data,
        id: event.id,
        retry: pendingRetry,
      })
      pendingRetry = undefined
    },
    onRetry: (retry) => {
      pendingRetry = retry
    },
    onError: (error) => {
      if (error.type === "max-buffer-size-exceeded") {
        overflow = ChannelError.protocol(error.message, { cause: error })
      }
    },
    maxBufferSize: maxBufferChars,
  })

  try {
    while (true) {
      const result = await reader.read()
      if (result.done) {
        parser.feed(decoder.decode())
        if (overflow !== undefined) {
          throw overflow
        }
        return
      }
      parser.feed(decoder.decode(result.value, { stream: true }))
      if (overflow !== undefined) {
        throw overflow
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function resolveGlobalFetch(): WebFetch {
  if (typeof fetch !== "function") {
    throw ChannelError.config(
      "no global fetch is available; pass options.fetch to the SSE transport",
    )
  }
  return (input, init) => fetch(input, init)
}
