import {
  createBoundedQueue,
  isRetryable,
  type OverflowPolicy,
  QueueFullError,
  raceAbort,
} from "@plainworks/std/resilience"
import {
  noopTelemetry,
  type PlainEvent,
  type StreamFrame,
  type Telemetry,
} from "@plainworks/std/seam"
import { ChannelError } from "../errors"
import type { Channel } from "../lifecycle"
import { validateControl } from "./control"
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
   * oldest buffered event; `drop-new` and `reject` discard the new one. Every overflow invalidates
   * the delivery generation and calls sink reset hooks. The triggering drop reaches `onDrop`.
   */
  readonly overflow?: OverflowPolicy
  /** Hears every event the full buffer discards, so loss is never silent. */
  readonly onDrop?: (event: TEvent) => void
  /**
   * Receives a `channel.event.dropped` event for every discarded event, with the
   * `channel.overflow.policy` and `channel.event.type` attributes. Defaults to no telemetry.
   */
  readonly telemetry?: Telemetry
  /** Notified when decoding or delivery fails, before invalidating the generation for recovery. */
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
 * `telemetry`. Decode/delivery failures cancel the generation and reset sinks, so acknowledgement
 * cannot skip a gap. Build one router per channel; never a module singleton.
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
  let deliveryCanceller = new AbortController()
  let generation = 0
  let closed = false
  const pendingIds = new Set<string>()
  type Delivery = { event: TEvent | undefined; frame: StreamFrame; generation: number }

  /** Observers are untrusted callbacks: a throw must never interrupt the frame callback or drain. */
  const notify = (observe: () => void): void => {
    try {
      observe()
    } catch {
      // No one left to report an observer's own failure to — the drain must continue.
    }
  }
  const reportError = (error: ChannelError): void => notify(() => onError?.(error))
  const control = (kind: "reset" | "connected"): void => {
    if (closed) return
    const signal = deliveryCanceller.signal
    for (const sink of sinks) {
      try {
        Promise.resolve(sink[kind]?.(signal)).catch((cause: unknown) => {
          if (!signal.aborted)
            reportError(ChannelError.protocol("snapshot recovery failed", { cause }))
        })
      } catch (cause) {
        reportError(ChannelError.protocol("snapshot recovery failed", { cause }))
      }
    }
  }
  const reset = (): void => {
    if (closed) return
    generation++
    deliveryCanceller.abort()
    deliveryCanceller = new AbortController()
    pendingIds.clear()
    channel.resetCursor()
    control("reset")
  }
  const reportDrop = ({ event }: Delivery): void => {
    if (event !== undefined) notify(() => onDrop?.(event))
    notify(() =>
      telemetry.event("channel.event.dropped", {
        "channel.overflow.policy": overflow,
        "channel.event.type": event?.type ?? "unrouted",
      }),
    )
    reset()
  }
  const queue = createBoundedQueue<Delivery>(capacity, { overflow, onDrop: reportDrop })

  const subscription = channel.onAny((frame) => {
    if (frame.type === "connected") {
      control("connected")
      return
    }
    if (frame.type === "reset") {
      reset()
      return
    }
    if (frame.type === "failure") {
      try {
        validateControl(frame)
      } catch (error) {
        if (!isRetryable(error)) {
          reportError(
            error instanceof ChannelError
              ? error
              : ChannelError.protocol("Invalid event control.", { cause: error }),
          )
          close()
        }
      }
      return
    }
    if (frame.id !== undefined && pendingIds.has(frame.id)) return
    let event: TEvent | undefined
    try {
      event = decode(frame)
    } catch (cause) {
      reportError(ChannelError.protocol("event decode failed", { cause }))
      reset()
      return
    }
    const delivery = { event, frame, generation }
    if (frame.id !== undefined) pendingIds.add(frame.id)
    try {
      queue.push(delivery)
    } catch (error) {
      // `reject` refuses the newcomer by throwing; the router treats that as a drop, not a failure.
      if (!(error instanceof QueueFullError)) {
        throw error
      }
      reportDrop(delivery)
    }
  })
  // A dead channel may never send an in-stream `failure` frame (a pre-stream HTTP failure or
  // reconnect exhaustion). Own that terminal outcome: report it once and tear the sinks down so the
  // snapshot owner stops reporting fresh, rather than depending on a wire frame that never arrives.
  const lifecycle = channel.onError((error) => {
    if (channel.status !== "closed") return
    reportError(error)
    close()
  })

  const drain = async (): Promise<void> => {
    while (!drainCanceller.signal.aborted) {
      let delivery: Delivery
      try {
        delivery = await queue.pop({ signal: drainCanceller.signal })
      } catch {
        // Queue closed or drain cancelled — stop draining.
        return
      }
      const { event, frame } = delivery
      if (delivery.generation !== generation) continue
      if (event === undefined) {
        if (frame.id !== undefined) pendingIds.delete(frame.id)
        channel.acknowledge(frame)
        continue
      }
      const signal = deliveryCanceller.signal
      let applied = true
      for (const sink of sinks) {
        // A close during an in-flight delivery stops the drain before the next sink/event.
        if (drainCanceller.signal.aborted || signal.aborted) {
          applied = false
          break
        }
        try {
          await raceAbort(Promise.resolve(sink.deliver(event, signal)), signal)
        } catch (cause) {
          applied = false
          if (!signal.aborted) {
            reportError(ChannelError.protocol("event sink failed", { cause }))
            reset()
          }
          break
        }
      }
      if (delivery.generation === generation) {
        if (frame.id !== undefined) pendingIds.delete(frame.id)
        if (applied && !signal.aborted) channel.acknowledge(frame)
      }
    }
  }
  void drain()

  if (channel.status === "closed" && channel.error !== undefined) {
    reportError(channel.error)
    close()
  } else if (channel.ready) control("connected")

  function close(): void {
    if (closed) return
    closed = true
    subscription.unsubscribe()
    lifecycle.unsubscribe()
    drainCanceller.abort()
    deliveryCanceller.abort()
    pendingIds.clear()
    queue.close()
    for (const sink of sinks) {
      try {
        sink.close?.()
      } catch (cause) {
        reportError(ChannelError.protocol("event sink cleanup failed", { cause }))
      }
    }
  }
  return { close }
}
