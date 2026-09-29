import type { Listener } from "@plainworks/std/seam"

/** A listener plus the ordered log of values it received. */
export interface Recorder<T> {
  /** Values received so far, in arrival order. */
  readonly events: readonly T[]
  /** The {@link Listener} to subscribe — every value it receives is appended to {@link Recorder.events}. */
  readonly listener: Listener<T>
  /** Drop all recorded values. */
  clear(): void
}

/**
 * Build a {@link Recorder} that captures every value delivered to its listener, so a test can
 * subscribe it to any emitter/stream and assert on the sequence received.
 */
export function recordEvents<T>(): Recorder<T> {
  const events: T[] = []
  return {
    events,
    listener: (value: T) => {
      events.push(value)
    },
    clear() {
      events.length = 0
    },
  }
}
