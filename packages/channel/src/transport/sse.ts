// The neutral (`.`) SSE transport: `fetch` + `Response.body` + `eventsource-parser`, never the DOM
// `EventSource` (which cannot attach an `Authorization` header — the reason this kit streams over
// `fetch`). It implements one attempt of the transport seam; reconnect/backoff/timeouts live in the
// channel core. Runs anywhere `fetch` and `TextDecoder` exist (Node, edge, workers, browser).

import { decodeResponseFailure } from "@plainworks/http"
import { isPositiveInteger } from "@plainworks/std"
import { AbortError } from "@plainworks/std/resilience"
import type {
  StreamTransport,
  StreamTransportContext,
  StreamTransportFactory,
} from "@plainworks/std/seam"
import { type Clock, systemClock } from "@plainworks/std/time"
import {
  cancelReadable,
  resolveFetch,
  type WebFetch,
  type WebReadableStream,
  type WebResponse,
} from "@plainworks/std/web"
import { createParser } from "eventsource-parser"
import { ChannelError } from "../errors"
import { resolveUrl, type UrlSource } from "./url"

const DEFAULT_MAX_BUFFER_CHARS = 1_048_576

/** Construction options for {@link createSseTransport}. */
export interface SseTransportOptions {
  /** The SSE endpoint — a string, or a provider re-resolved on every attempt (never carries a token). */
  readonly url: UrlSource
  /** Injected `fetch`; defaults to the global `fetch`. Streaming requires a real streamed `Response`. */
  readonly fetch?: WebFetch
  readonly clock?: Clock
  /**
   * Bound (in characters) on the parser's retained partial line and accumulated multi-line event,
   * guarding against a server streaming an unbounded frame with no delimiter (a memory-exhaustion
   * vector). Exceeding it ends the connection with a protocol error. Default 1,048,576 characters.
   */
  readonly maxBufferChars?: number
}

/**
 * A pluggable SSE {@link StreamTransportFactory} for {@link createChannel}. Each attempt issues one
 * `GET` with the channel's resolved headers plus the SSE protocol headers
 * (`Accept: text/event-stream`, `Cache-Control: no-cache`, and header-only `Last-Event-ID` resume),
 * verifies the response is an `ok` event stream, signals `onOpen`, then pulls the body one chunk at
 * a time — pull-based backpressure, no unbounded internal queue — decoding frames to `onFrame`.
 */
export function createSseTransport(options: SseTransportOptions): StreamTransportFactory {
  const { url, maxBufferChars = DEFAULT_MAX_BUFFER_CHARS } = options
  // A non-integer/overflowing bound (e.g. Infinity) would make the parser's size check permanently
  // pass, defeating the memory bound — reject it at construction.
  if (!isPositiveInteger(maxBufferChars)) {
    throw ChannelError.config("maxBufferChars must be a safe integer >= 1")
  }
  const fetchImpl = resolveFetch(options.fetch, () =>
    ChannelError.config("no global fetch is available; pass options.fetch to the SSE transport"),
  )

  return (): StreamTransport => ({
    async open(context: StreamTransportContext): Promise<void> {
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
        response = await fetchImpl(endpoint, {
          method: "GET",
          headers,
          signal: context.signal,
          redirect: "error",
        })
      } catch (cause) {
        if (context.signal.aborted) {
          // The core aborted the attempt (connect/idle timeout or close); it owns the settled
          // outcome.
          throw cause
        }
        throw ChannelError.connect("channel connection failed", { cause })
      }

      if (!response.ok) {
        const failure = await decodeResponseFailure(
          response,
          context.signal,
          (options.clock ?? systemClock).now(),
        )
        throw ChannelError.failure(failure, { status: response.status, cause: failure })
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

/**
 * Pull the body one chunk at a time and dispatch each decoded SSE frame; resolve on clean EOF. The
 * reader owns the stream: an abort, an overflow, or a throwing consumer cancels it, and every exit
 * releases the lock, so nothing leaks even when `fetch` does not tear the body down itself.
 */
async function readEventStream(
  body: WebReadableStream<Uint8Array>,
  context: StreamTransportContext,
  maxBufferChars: number,
): Promise<void> {
  const { signal } = context
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let pendingRetry: number | undefined
  let overflow: ChannelError | undefined
  const parser = createParser({
    // Parser receipt metadata is separate from acknowledged application delivery.
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
      context.onRetry?.(retry)
    },
    onError: (error) => {
      if (error.type === "max-buffer-size-exceeded") {
        overflow = ChannelError.protocol(error.message, { cause: error })
      }
    },
    maxBufferSize: maxBufferChars,
  })
  // Cancelling settles a pending `read()` as done, so the loop below sees the abort and exits.
  const onAbort = (): void => {
    cancelReadable(reader, signal.reason)
  }
  signal.addEventListener("abort", onAbort, { once: true })

  try {
    while (true) {
      // An already-aborted signal never fires `abort` again, so check before every read.
      if (signal.aborted) {
        cancelReadable(reader, signal.reason)
        throw new AbortError({ cause: signal.reason })
      }
      const result = await reader.read().catch((cause: unknown) => {
        if (signal.aborted) throw new AbortError({ cause: signal.reason })
        throw ChannelError.connect("channel stream read failed", { cause })
      })
      if (signal.aborted) {
        throw new AbortError({ cause: signal.reason })
      }
      parser.feed(result.done ? decoder.decode() : decoder.decode(result.value, { stream: true }))
      if (overflow !== undefined) {
        throw overflow
      }
      if (result.done) {
        return
      }
    }
  } catch (error) {
    cancelReadable(reader, error)
    throw error
  } finally {
    signal.removeEventListener("abort", onAbort)
    reader.releaseLock()
  }
}
