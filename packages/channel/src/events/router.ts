import { createBoundedQueue, type OverflowPolicy } from "@plainworks/std"
import { ChannelError } from "../error"
import type { Channel } from "../lifecycle/channel"
import type { DecodedEvent, EventDecoder } from "./event"
import type { EventSink } from "./sink"

const DEFAULT_CAPACITY = 1_024

/** Construction options for {@link createEventRouter}. */
export interface EventRouterOptions<T> {
  /** The channel whose frames are decoded and routed. */
  readonly channel: Channel
  /** Decode each raw frame into a typed event (or drop it) at the trust boundary. */
  readonly decode: EventDecoder<T>
  /** Sinks fed every decoded event, in order, one event at a time. */
  readonly sinks: readonly EventSink<T>[]
  /**
   * Bound on buffered-but-undelivered events between the (sync) frame callback and the (async) drain. Keeps memory bounded when sinks fall behind the stream. Default 1024.
   */
  readonly capacity?: number
  /** What a full buffer does with a new event; default `drop-oldest` (freshest-wins). */
  readonly overflow?: OverflowPolicy
  /** Notified when a decode throws or a sink rejects; the router drops that event and continues. */
  readonly onError?: (error: ChannelError) => void
}

/** A running event router; `close` detaches from the channel and drains no further. */
export interface EventRouter {
  /** Stop routing: unsubscribe from the channel, cancel the drain, and release the buffer. */
  close(): void
}

/**
 * Route a {@link Channel}'s raw frames to typed {@link EventSink}s. Frames arrive synchronously and are decoded then pushed onto a **bounded** queue; a single async drain pops them and delivers to every sink serially, so a slow sink backpressures the buffer (bounded, freshest-wins by default) instead of growing without limit. A decode or sink failure is reported to `onError` and the event is dropped — one bad event never stalls the stream. Build one per channel; never a module singleton.
 */
export function createEventRouter<T>(options: EventRouterOptions<T>): EventRouter {
  const { channel, decode, sinks, capacity = DEFAULT_CAPACITY, overflow, onError } = options
  const queue = createBoundedQueue<DecodedEvent<T>>(capacity, overflow ? { overflow } : {})
  const drainCanceller = new AbortController()

  /** Observers are untrusted callbacks: a throw must never interrupt the frame callback or drain. */
  const reportError = (error: ChannelError): void => {
    try {
      onError?.(error)
    } catch {
      // No one left to report an observer's own failure to — the drain must continue.
    }
  }

  const subscription = channel.onAny((frame) => {
    let event: DecodedEvent<T> | undefined
    try {
      event = decode(frame)
    } catch (cause) {
      reportError(ChannelError.protocol("event decode failed", { cause }))
      return
    }
    if (event !== undefined) {
      queue.push(event)
    }
  })

  const drain = async (): Promise<void> => {
    while (!drainCanceller.signal.aborted) {
      let event: DecodedEvent<T>
      try {
        event = await queue.pop({ signal: drainCanceller.signal })
      } catch {
        // Queue closed or drain cancelled — stop draining.
        return
      }
      for (const sink of sinks) {
        // A close during an in-flight delivery stops the drain before the next sink/event.
        if (drainCanceller.signal.aborted) {
          return
        }
        try {
          await sink.deliver(event, drainCanceller.signal)
        } catch (cause) {
          reportError(ChannelError.protocol("event sink failed", { cause }))
        }
      }
    }
  }
  void drain()

  return {
    close(): void {
      subscription.unsubscribe()
      drainCanceller.abort()
      queue.close()
    },
  }
}
