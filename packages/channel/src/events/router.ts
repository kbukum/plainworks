import { createBoundedQueue, type OverflowPolicy, QueueFullError } from "@plainworks/std/resilience"
import { noopTelemetry, type PlainEvent, type Telemetry } from "@plainworks/std/seam"
import { ChannelError } from "../error"
import type { Channel } from "../lifecycle"
import type { EventDecoder } from "./event"
import type { EventSink } from "./sink"

const DEFAULT_CAPACITY = 1_024

/** Construction options for {@link createEventRouter}. */
export interface EventRouterOptions<TEvent extends PlainEvent> {
  /** The channel whose frames are decoded and routed. */
  readonly channel: Channel
  /** Decode each raw frame into a typed event (or drop it) at the trust boundary. */
  readonly decode: EventDecoder<TEvent>
  /** Sinks fed every decoded event, in order, one event at a time. */
  readonly sinks: readonly EventSink<TEvent>[]
  /**
   * Bound on buffered-but-undelivered events between the (sync) frame callback and the (async)
   * drain. Keeps memory bounded when sinks fall behind the stream. Default 1024.
   */
  readonly capacity?: number
  /**
   * What a full buffer does with a new event. `drop-oldest` (the default, freshest-wins) evicts the
   * oldest buffered event; `drop-new` and `reject` both discard the new one. The stream never
   * stalls or fails on overflow, and every discarded event is reported through `onDrop` and
   * `telemetry`.
   */
  readonly overflow?: OverflowPolicy
  /** Hears every event the full buffer discards, so loss is never silent. */
  readonly onDrop?: (event: TEvent) => void
  /**
   * Receives a `channel.event.dropped` event for every discarded event, with the
   * `channel.overflow.policy` and `channel.event.type` attributes. Defaults to no telemetry.
   */
  readonly telemetry?: Telemetry
  /** Notified when a decode throws or a sink rejects; the router drops that event and continues. */
  readonly onError?: (error: ChannelError) => void
}

/** A running event router; `close` detaches from the channel and drains no further. */
export interface EventRouter {
  /** Stop routing: unsubscribe from the channel, cancel the drain, and release the buffer. */
  close(): void
}

/**
 * Route a {@link Channel}'s raw frames to typed {@link EventSink}s. Frames arrive synchronously and
 * are decoded then pushed onto a **bounded** queue; a single async drain pops them and delivers to
 * every sink serially, so a slow sink backpressures the buffer (bounded, freshest-wins by default)
 * instead of growing without limit. Every event the full buffer discards reaches `onDrop` and
 * `telemetry`. A decode or sink failure is reported to `onError` and the event
 * is dropped — one bad event never stalls the stream. Build one per channel; never a module
 * singleton.
 */
export function createEventRouter<TEvent extends PlainEvent>(
  options: EventRouterOptions<TEvent>,
): EventRouter {
  const {
    channel,
    decode,
    sinks,
    capacity = DEFAULT_CAPACITY,
    overflow = "drop-oldest",
    onDrop,
    telemetry = noopTelemetry,
    onError,
  } = options
  const drainCanceller = new AbortController()

  /** Observers are untrusted callbacks: a throw must never interrupt the frame callback or drain. */
  const notify = (observe: () => void): void => {
    try {
      observe()
    } catch {
      // No one left to report an observer's own failure to — the drain must continue.
    }
  }
  const reportError = (error: ChannelError): void => notify(() => onError?.(error))
  const reportDrop = (event: TEvent): void => {
    notify(() => onDrop?.(event))
    notify(() =>
      telemetry.event("channel.event.dropped", {
        "channel.overflow.policy": overflow,
        "channel.event.type": event.type,
      }),
    )
  }
  const queue = createBoundedQueue<TEvent>(capacity, { overflow, onDrop: reportDrop })

  const subscription = channel.onAny((frame) => {
    let event: TEvent | undefined
    try {
      event = decode(frame)
    } catch (cause) {
      reportError(ChannelError.protocol("event decode failed", { cause }))
      return
    }
    if (event === undefined) {
      return
    }
    try {
      queue.push(event)
    } catch (error) {
      // `reject` refuses the newcomer by throwing; the router treats that as a drop, not a failure.
      if (!(error instanceof QueueFullError)) {
        throw error
      }
      reportDrop(event)
    }
  })

  const drain = async (): Promise<void> => {
    while (!drainCanceller.signal.aborted) {
      let event: TEvent
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
