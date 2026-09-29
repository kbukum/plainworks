import { createEmitter, type Emitter } from "@plainworks/std/emitter"
import type { Subscription } from "@plainworks/std/seam"

/** One end of a bridge: post frames outward, subscribe to frames arriving from the other end. */
export interface BridgePort {
  post(frame: unknown): void
  subscribe(listener: (frame: unknown) => void): Subscription
}

/**
 * A duplex transport between the host (session) and the client (panel). The default is in-memory
 * and host-free; the serializable seam also supports `BroadcastChannel`, dev-server, or remote
 * transport implementations without changing a source or the session.
 */
export interface Bridge {
  readonly host: BridgePort
  readonly client: BridgePort
  dispose(): void
}

/** Options for {@link createMemoryBridge}. */
export interface MemoryBridgeOptions {
  /**
   * Notified when a subscriber throws. Delivery to other subscribers continues regardless — one
   * broken listener never blocks the bridge. Defaults to a no-op so isolation is the safe default.
   */
  readonly onError?: (error: unknown) => void
}

/**
 * Create an in-process {@link Bridge}. A frame posted on one end is delivered synchronously to the
 * other end's subscribers only — never echoed back to the sender. Frames are passed by reference;
 * serializability is guaranteed upstream by the session, so a remote bridge can serialize the same
 * frames unchanged.
 */
export function createMemoryBridge(options: MemoryBridgeOptions = {}): Bridge {
  const emitterOptions = { onListenerError: options.onError ?? (() => {}) }
  const toHost = createEmitter<unknown>(emitterOptions)
  const toClient = createEmitter<unknown>(emitterOptions)

  const port = (own: Emitter<unknown>, peer: Emitter<unknown>): BridgePort => ({
    post: (frame) => peer.emit(frame),
    subscribe: (listener) => own.subscribe(listener),
  })

  return {
    host: port(toHost, toClient),
    client: port(toClient, toHost),
    dispose() {
      toHost.clear()
      toClient.clear()
    },
  }
}
