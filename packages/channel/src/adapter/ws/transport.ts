// The neutral (`.`) WebSocket transport: one attempt over an injected socket seam, decoding each inbound message to a channel frame. Reconnect/backoff/timeouts live in the channel core; this stays a thin per-attempt adapter. An optional app-level heartbeat sends a periodic ping through the injected `Delay` seam so a NAT/proxy keeps the connection alive; the server's pong is an ordinary inbound frame that resets the core's idle-read timer.
import { type Delay, systemDelay } from "@plainworks/std"
import { assertDurationMs } from "../../duration"
import { ChannelError } from "../../error"
import type { Transport, TransportContext, TransportFactory } from "../../transport"
import { resolveUrl, type UrlSource } from "../url"
import {
  resolveGlobalSocketFactory,
  SOCKET_OPEN,
  type WebSocketFactory,
  type WebSocketLike,
} from "./socket"

/** Periodic keep-alive ping. */
export interface WsHeartbeat {
  /** Interval between pings (ms). */
  readonly intervalMs: number
  /** Text payload to send; default `"ping"`. */
  readonly message?: string
}

/** Construction options for {@link createWsTransport}. */
export interface WsTransportOptions {
  /** The WebSocket endpoint — a string, or a provider re-resolved on every attempt (never a token). */
  readonly url: UrlSource
  /** Injected socket factory; defaults to `globalThis.WebSocket` (which cannot forward headers). */
  readonly socketFactory?: WebSocketFactory
  /** Optional WebSocket subprotocols. */
  readonly protocols?: string | readonly string[]
  /** Optional app-level keep-alive ping. */
  readonly heartbeat?: WsHeartbeat
  /** Injected delay for deterministic heartbeat timing; defaults to the host timer. */
  readonly delay?: Delay
}

/**
 * A pluggable WebSocket {@link TransportFactory} for {@link createChannel}. Each attempt opens one socket (header-only auth via the injected factory), signals `onOpen`, maps every inbound message to an `onFrame` of type `"message"`, and resolves on a clean close / rejects on an error or dirty close.
 */
export function createWsTransport(options: WsTransportOptions): TransportFactory {
  const { url, protocols, heartbeat, delay = systemDelay } = options
  const socketFactory = options.socketFactory ?? resolveGlobalSocketFactory()
  if (heartbeat !== undefined) {
    // Fail fast at construction: an invalid interval would otherwise surface mid-stream as a delay rejection the loop cannot distinguish from a cancellation, and a zero interval would spin the loop into a CPU/network storm.
    assertDurationMs("heartbeat.intervalMs", heartbeat.intervalMs)
    if (heartbeat.intervalMs < 1) {
      throw ChannelError.config("heartbeat.intervalMs must be at least 1 ms")
    }
  }

  return (): Transport => ({
    async open(context: TransportContext): Promise<void> {
      const endpoint = await resolveUrl(url, context.signal)
      return new Promise<void>((resolve, reject) => {
        // The attempt may have aborted while the endpoint resolved — never open a socket for it.
        if (context.signal.aborted) {
          reject(context.signal.reason)
          return
        }
        let settled = false
        let stopHeartbeat = (): void => {}
        const socket = socketFactory(endpoint, { headers: context.headers, protocols })
        // Browser sockets default to `blob`; binary frames must arrive as an ArrayBuffer to decode.
        socket.binaryType = "arraybuffer"

        const cleanup = (): void => {
          stopHeartbeat()
          context.signal.removeEventListener("abort", onAbort)
          socket.onopen = null
          socket.onmessage = null
          socket.onerror = null
          socket.onclose = null
        }
        const finish = (run: () => void): void => {
          if (settled) {
            return
          }
          settled = true
          cleanup()
          run()
        }
        function onAbort(): void {
          finish(() => {
            closeQuietly(socket)
            reject(context.signal.reason)
          })
        }

        if (context.signal.aborted) {
          closeQuietly(socket)
          reject(context.signal.reason)
          return
        }
        context.signal.addEventListener("abort", onAbort, { once: true })

        socket.onopen = (): void => {
          if (settled) {
            return
          }
          context.onOpen()
          if (heartbeat !== undefined) {
            stopHeartbeat = startHeartbeat(socket, heartbeat, delay, (cause) =>
              finish(() => {
                closeQuietly(socket)
                reject(ChannelError.connect("channel heartbeat failed", { cause }))
              }),
            )
          }
        }
        socket.onmessage = (event): void => {
          if (settled) {
            return
          }
          try {
            context.onFrame({ type: "message", data: decodeData(event.data) })
          } catch (cause) {
            finish(() => {
              closeQuietly(socket)
              reject(cause)
            })
          }
        }
        socket.onerror = (): void => {
          // An error event is not guaranteed to be followed by a close — close the socket so a reconnect never leaves the failed one open with its handlers detached.
          finish(() => {
            closeQuietly(socket)
            reject(ChannelError.connect("channel socket error"))
          })
        }
        socket.onclose = (event): void => {
          finish(() => {
            if (event.wasClean) {
              resolve()
            } else {
              reject(ChannelError.connect(`channel socket closed uncleanly (code ${event.code})`))
            }
          })
        }
      })
    },
  })
}

/**
 * Send a periodic ping while the socket is open; returns a canceller that stops the loop. Only a cancellation is silent — any other `delay` failure is reported via `onFailure` so it reaches the connection lifecycle instead of leaving a quietly heartbeat-less socket.
 */
function startHeartbeat(
  socket: WebSocketLike,
  heartbeat: WsHeartbeat,
  delay: Delay,
  onFailure: (cause: unknown) => void,
): () => void {
  const canceller = new AbortController()
  const signal = canceller.signal
  const message = heartbeat.message ?? "ping"
  const loop = async (): Promise<void> => {
    while (!signal.aborted) {
      try {
        await delay(heartbeat.intervalMs, signal)
      } catch (error) {
        if (!signal.aborted) {
          onFailure(error)
        }
        return
      }
      if (signal.aborted || socket.readyState !== SOCKET_OPEN) {
        return
      }
      try {
        socket.send(message)
      } catch (error) {
        // A failed send does not guarantee a later error/close event — fail the attempt so the socket closes and the core reconnects instead of leaving the transport pending forever.
        onFailure(error)
        return
      }
    }
  }
  void loop()
  return () => canceller.abort()
}

/**
 * Decode a text or binary frame to the string the event router parses. Anything else (e.g. a `Blob` from a socket that ignored `binaryType = "arraybuffer"`) is a protocol failure — never a lossy `String()` coercion that would corrupt the frame into `"[object Blob]"`.
 */
function decodeData(data: unknown): string {
  if (typeof data === "string") {
    return data
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data)
  }
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data)
  }
  throw ChannelError.protocol(
    `undecodable socket frame (expected string or ArrayBuffer, got ${Object.prototype.toString.call(data)})`,
  )
}

function closeQuietly(socket: WebSocketLike): void {
  try {
    socket.close(1000, "channel closed")
  } catch {
    // A socket that rejects an idempotent close is already gone; nothing to do.
  }
}
