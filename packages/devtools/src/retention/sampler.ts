import { assertTimerMs } from "@plainworks/std"
import type { SourceEvent } from "../protocol"

/** How a sampler thins a burst: keep the first event of each window, or keep only the latest. */
export type SamplingMode = "sample" | "coalesce"

/** Options for {@link createEventSampler}. */
export interface EventSamplerOptions {
  /** Sampling window in milliseconds; `0` emits every offered event immediately. */
  readonly intervalMs: number
  /** Keep the first event of each window (`"sample"`) or the latest one (`"coalesce"`). */
  readonly mode: SamplingMode
  /** Callback invoked when an event is emitted. */
  readonly onEmit: (event: SourceEvent) => void
  /** Receives a clock or emission failure from the owned trailing timer. */
  readonly onError?: (error: unknown) => void
  /** Injected clock for the current time. Defaults to `Date.now`. */
  readonly now?: () => number
}

/**
 * A timer-owned sampler an adapter wraps its emit with, so retention policy is not baked into every
 * source. It is the single owner of burst thinning:
 *
 * - `"sample"` emits the first event of each window and drops the rest — no trailing event, so no
 *   timer is armed.
 * - `"coalesce"` emits the first event immediately to open the window, holds the latest event
 *   within it, and lets the owned timer release that trailing event at the window boundary — the
 *   final event of a burst is never stranded waiting for a later offer.
 *
 * `flush` releases a held event immediately; `dispose` cancels any active timer cleanly without
 * leaking or emitting.
 */
export interface EventSampler {
  /** Offer an event to be emitted immediately, held, or dropped per the mode. */
  offer(event: SourceEvent): void
  /** Emit any held event immediately and cancel the timer. */
  flush(): void
  /** Cancel any active timer and release held events. Clean teardown. */
  dispose(): void
}

/**
 * Create an {@link EventSampler}. In `"sample"` mode the first event of each interval is emitted
 * and the rest dropped. In `"coalesce"` mode the latest event in an interval survives, emitted on
 * the leading edge or released by the owned timer at the interval boundary.
 */
export function createEventSampler(options: EventSamplerOptions): EventSampler {
  const { intervalMs, mode, onEmit, onError } = options
  const now = options.now ?? Date.now
  assertTimerMs(intervalMs)

  if (intervalMs === 0) {
    return {
      offer(event) {
        onEmit(event)
      },
      flush() {},
      dispose() {},
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: SourceEvent | undefined
  let windowEnd = 0
  let disposed = false

  function onTimer(): void {
    timer = undefined
    if (disposed) return
    if (pending !== undefined) {
      const event = pending
      pending = undefined
      try {
        windowEnd = now() + intervalMs
        onEmit(event)
      } catch (error) {
        if (onError === undefined) throw error
        try {
          onError(error)
        } catch {
          // A timer callback has no caller to receive a secondary reporting failure.
        }
      }
    }
  }

  function schedule(delayMs: number): void {
    if (timer !== undefined) return
    timer = setTimeout(onTimer, Math.max(0, delayMs))
  }

  return {
    offer(event) {
      if (disposed) return
      const current = now()
      if (mode === "sample") {
        if (current >= windowEnd) {
          windowEnd = current + intervalMs
          onEmit(event)
        }
        return
      }
      if (current >= windowEnd && timer === undefined) {
        windowEnd = current + intervalMs
        onEmit(event)
        return
      }
      pending = event
      schedule(windowEnd - current)
    },
    flush() {
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      if (pending !== undefined && !disposed) {
        const event = pending
        pending = undefined
        onEmit(event)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      pending = undefined
    },
  }
}
