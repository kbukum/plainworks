import type { Listener, Subscription } from "../seam/events"

/** Options for {@link createEmitter}. */
export interface EmitterOptions {
  /**
   * Receives each error a listener throws. Delivery to the other listeners continues either way.
   * Without it, `emit` rethrows once every listener has run: the error itself when one listener
   * failed, or an `AggregateError` when several did.
   */
  readonly onListenerError?: (error: unknown) => void
}

/**
 * A synchronous, in-memory event emitter. `emit` calls every current listener in subscription
 * order. A listener added during a pass first hears the next value; one removed during a pass is
 * not skipped past others. There is no replay: a late subscriber hears only later values.
 */
export interface Emitter<T> {
  /** Add a listener. Each call is its own subscription, even for the same callback. */
  subscribe(listener: Listener<T>): Subscription
  /** Deliver `value` to every current listener. */
  emit(value: T): void
  /** How many listeners are attached. `0` proves every subscription was released. */
  readonly listenerCount: number
  /** Detach every listener, for example when the owner is disposed. */
  clear(): void
}

/**
 * Build an {@link Emitter}. One per owner, never a module singleton. A throwing listener never
 * stops delivery to the others; see {@link EmitterOptions.onListenerError} for where its error
 * goes.
 */
export function createEmitter<T>(options: EmitterOptions = {}): Emitter<T> {
  const { onListenerError } = options
  // Keyed by registration, not by callback, so subscribing the same callback twice gives two
  // independent subscriptions and releasing one never drops the other.
  const registrations = new Set<{ readonly listener: Listener<T> }>()

  return {
    subscribe(listener) {
      const registration = { listener }
      registrations.add(registration)
      return {
        unsubscribe: () => {
          registrations.delete(registration)
        },
      }
    },
    emit(value) {
      const failures: unknown[] = []
      // A snapshot, so a listener that subscribes or unsubscribes mid-pass can't change this pass.
      for (const { listener } of [...registrations]) {
        try {
          listener(value)
        } catch (error) {
          if (onListenerError === undefined) {
            failures.push(error)
          } else {
            onListenerError(error)
          }
        }
      }
      if (failures.length === 1) {
        throw failures[0]
      }
      if (failures.length > 1) {
        throw new AggregateError(failures, `${failures.length} listeners threw`)
      }
    },
    get listenerCount() {
      return registrations.size
    },
    clear() {
      registrations.clear()
    },
  }
}
