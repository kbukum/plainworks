import type { WebAbortSignal } from "../web"

/**
 * A decoded, typed application event — the shape a transport hands to whatever routes events into
 * the tools the app already has (the query cache, a state store). `TType` is the discriminant;
 * `TData` is the decoded payload.
 */
export interface PlainEvent<TType extends string = string, TData = unknown> {
  /** Discriminant identifying what happened. */
  readonly type: TType
  /** Decoded payload for this event. */
  readonly data: TData
}

/** Callback invoked with each emitted value. */
export type Listener<T> = (value: T) => void

/**
 * Handle returned by every subscription. Call `unsubscribe` exactly once to detach the listener and
 * release its resources — the canonical teardown contract for streams, emitters, and stores.
 */
export interface Subscription {
  unsubscribe(): void
}

/**
 * The single delivery seam every event driver fans out to — a channel router draining a live
 * stream, a test harness scripting one. One contract, so a sink built for the query cache and a
 * sink built for a state slot are the same type and both plug into the same driver.
 *
 * The contract, settled once here so the two consumers cannot drift again:
 *
 * - **Serial, backpressure-aware.** A driver awaits an async `deliver` before the next event, so a
 *   slow sink throttles the stream instead of letting an unbounded backlog build.
 * - **Cancellation is part of delivery, not optional.** `signal` aborts when the driver tears down;
 *   a sink that keeps writing past an aborted signal is a bug, not a permitted variant.
 * - **Failure is observable.** `deliver` may reject; the driver surfaces the failure (channel's
 *   router routes it to `onError`) and never lets a rejection silently stall the drain.
 * - **Sinks must be idempotent.** After a resume-from-cursor reconnect a driver may redeliver
 *   events; the seam does not deduplicate, so a sink must converge under redelivery (fold by
 *   identity, not by blind accumulation).
 */
export interface EventSink<TEvent extends PlainEvent = PlainEvent> {
  /**
   * Handle one event; may be async, in which case the driver awaits it before the next. Cancel any
   * in-flight work when `signal` aborts rather than run past shutdown.
   */
  deliver(event: TEvent, signal: WebAbortSignal): void | Promise<void>
}
