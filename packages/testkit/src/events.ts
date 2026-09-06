import type { Listener, Subscription } from "@plainworks/std"

/**
 * A minimal in-memory emitter implementing the plainworks subscription seam ({@link Listener} +
 * {@link Subscription}). Use it as a fake event source to drive code that consumes a stream, and to
 * assert teardown via {@link TestEmitter.listenerCount}.
 */
export interface TestEmitter<T> {
  /** Register a listener; call the returned {@link Subscription} to detach it (idempotent). */
  subscribe(listener: Listener<T>): Subscription
  /** Synchronously deliver `value` to every current listener. */
  emit(value: T): void
  /** Number of currently-attached listeners — `0` proves everything unsubscribed. */
  readonly listenerCount: number
}

/** Build a fresh {@link TestEmitter}. Never a shared singleton — one per test. */
export function createEmitter<T>(): TestEmitter<T> {
  // Keyed by registration (not by listener) so subscribing the same callback twice yields two
  // independent subscriptions — collapsing them would hide ownership bugs in code under test.
  const registrations = new Set<{ listener: Listener<T> }>()
  return {
    subscribe(listener: Listener<T>): Subscription {
      const registration = { listener }
      registrations.add(registration)
      let active = true
      return {
        unsubscribe() {
          if (active) {
            active = false
            registrations.delete(registration)
          }
        },
      }
    },
    emit(value: T) {
      // Snapshot so a listener that unsubscribes mid-dispatch does not disturb this pass.
      for (const { listener } of [...registrations]) {
        listener(value)
      }
    },
    get listenerCount() {
      return registrations.size
    },
  }
}

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
