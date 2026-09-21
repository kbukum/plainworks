import type { Subscription } from "@plainworks/std"

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
  const onError = options.onError ?? (() => {})
  const hostListeners = new Set<(frame: unknown) => void>()
  const clientListeners = new Set<(frame: unknown) => void>()

  function deliver(listeners: Set<(frame: unknown) => void>, frame: unknown): void {
    for (const listener of [...listeners]) {
      try {
        listener(frame)
      } catch (error) {
        onError(error)
      }
    }
  }

  function port(
    own: Set<(frame: unknown) => void>,
    peer: Set<(frame: unknown) => void>,
  ): BridgePort {
    return {
      post: (frame) => deliver(peer, frame),
      subscribe(listener) {
        own.add(listener)
        return { unsubscribe: () => own.delete(listener) }
      },
    }
  }

  return {
    host: port(hostListeners, clientListeners),
    client: port(clientListeners, hostListeners),
    dispose() {
      hostListeners.clear()
      clientListeners.clear()
    },
  }
}
