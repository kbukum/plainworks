import type { Clock } from "@plainworks/std"
import type { SourceEvent } from "../protocol"

/** How a sampler thins a burst: keep the first of each window, or keep only the latest. */
export type SamplingMode = "sample" | "coalesce"

/** Configuration for {@link createEventSampler}; the clock is injected so tests stay deterministic. */
export interface EventSamplerOptions {
  readonly clock: Clock
  readonly intervalMs: number
  readonly mode: SamplingMode
}

/**
 * A rate limiter an adapter wraps its emit with, so retention policy is not baked into every
 * source. `offer` returns the event to emit or `null` when it is thinned; `flush` releases a
 * coalesced event still held at teardown.
 */
export interface EventSampler {
  offer(event: SourceEvent): SourceEvent | null
  flush(): SourceEvent | null
}

/**
 * Create an {@link EventSampler}. In `"sample"` mode the first event of each interval is emitted
 * and the rest dropped. In `"coalesce"` mode only the latest event in an interval survives, emitted
 * when the next interval opens or on {@link EventSampler.flush}.
 */
export function createEventSampler(options: EventSamplerOptions): EventSampler {
  const { clock, intervalMs, mode } = options
  let lastEmit = Number.NEGATIVE_INFINITY
  let pending: SourceEvent | null = null

  return {
    offer(event) {
      const now = clock.now()
      const windowOpen = now - lastEmit >= intervalMs
      if (mode === "sample") {
        if (!windowOpen) return null
        lastEmit = now
        return event
      }
      if (!windowOpen) {
        pending = event
        return null
      }
      lastEmit = now
      if (pending === null) return event
      const emitted = pending
      pending = event
      return emitted
    },
    flush() {
      const emitted = pending
      pending = null
      return emitted
    },
  }
}
