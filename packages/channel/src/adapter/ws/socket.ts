// The injected WebSocket seam. `WebSocket` is NOT a universal primitive (absent on some server runtimes, and the browser constructor cannot attach request headers), so it is an injected factory with a platform default — the same "inject what varies by host" rule the SSE transport applies to `fetch`. Header-only auth flows through {@link WebSocketConnectInit.headers}: a Node `ws` factory forwards them; the browser default cannot, so header-authenticated browser channels inject a factory (or rely on cookies). A token NEVER goes in the URL.
import type { AuthHeaders } from "@plainworks/std"
import { ChannelError } from "../../error"

/** The `readyState` value of an open socket (mirrors `WebSocket.OPEN`). */
export const SOCKET_OPEN = 1

/**
 * The minimal `WebSocket` surface the transport drives: send text, close, read `readyState`, and the four lifecycle handlers. A real platform `WebSocket` (browser or Node `ws`) satisfies it structurally.
 */
export interface WebSocketLike {
  readonly readyState: number
  /**
   * Binary delivery mode; the transport sets `"arraybuffer"` so binary messages arrive decodable. Left at the browser default (`"blob"`), a binary frame would surface as an undecodable `Blob`.
   */
  binaryType: string
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: (() => void) | null
  onmessage: ((event: { readonly data: unknown }) => void) | null
  onerror: ((event: unknown) => void) | null
  onclose:
    | ((event: {
        readonly code: number
        readonly reason: string
        readonly wasClean: boolean
      }) => void)
    | null
}

/** What the factory needs to open a socket: resolved header-only credentials and optional subprotocols. */
export interface WebSocketConnectInit {
  /** Resolved headers (auth + static) — a header-capable factory (Node `ws`) forwards these. */
  readonly headers: AuthHeaders
  /** Optional WebSocket subprotocols. */
  readonly protocols?: string | readonly string[] | undefined
}

/**
 * Constructs a {@link WebSocketLike}. Injected so a header-capable implementation (Node `ws`) can be supplied where the browser constructor cannot attach headers, and so tests drive a fake socket.
 */
export type WebSocketFactory = (url: string, init: WebSocketConnectInit) => WebSocketLike

type GlobalSocketCtor = new (url: string, protocols?: string | string[]) => WebSocketLike

/**
 * The platform default factory, built from `globalThis.WebSocket`. It cannot forward headers (the browser constructor has no header argument), so a header-authenticated channel must inject a header-capable factory instead.
 */
export function resolveGlobalSocketFactory(): WebSocketFactory {
  const ctor = (globalThis as { WebSocket?: GlobalSocketCtor }).WebSocket
  if (typeof ctor !== "function") {
    throw ChannelError.config(
      "no global WebSocket is available; pass a socketFactory to the WS transport",
    )
  }
  return (url, init) => {
    // The platform constructor has no header argument — fail rather than silently drop resolved credentials and downgrade an authenticated attempt to anonymous.
    if (Object.keys(init.headers).length > 0) {
      throw ChannelError.config(
        "the platform WebSocket cannot attach headers; inject a header-capable socketFactory (e.g. Node ws) or use cookie-based auth",
      )
    }
    return new ctor(
      url,
      init.protocols === undefined ? undefined : [...toProtocolArray(init.protocols)],
    )
  }
}

function toProtocolArray(protocols: string | readonly string[]): readonly string[] {
  return typeof protocols === "string" ? [protocols] : protocols
}
