import type { EventSink, PlainEvent, StateSource, WebAbortSignal } from "@plainworks/std"

/**
 * Fold a decoded event and the slot's current value into its next value. Returning the current
 * value unchanged is a valid no-op (e.g. an event type this slot ignores). Must be idempotent under
 * redelivery — see {@link EventSink}.
 */
export type StateProjection<TEvent extends PlainEvent, Value> = (
  event: TEvent,
  current: Value | undefined,
) => Value

/**
 * An {@link EventSink} that writes stream events into a single {@link StateSource} slot — the
 * `memory` scope of `@plainworks/state` in the default composition, but any backend that satisfies
 * the L0 `StateSource` seam. The sink writes **through** the state contract (`get` then `set`)
 * rather than reaching into a store, so scoped state stays the one source of truth. Each delivery
 * reads the current value, projects the next, and persists it; the router's serial drain makes the
 * read-project-write atomic per event (no interleaving).
 */
export function createStateSink<TEvent extends PlainEvent, Value>(
  source: StateSource<Value>,
  project: StateProjection<TEvent, Value>,
): EventSink<TEvent> {
  return {
    async deliver(event: TEvent, signal: WebAbortSignal): Promise<void> {
      const current = await source.get(signal)
      // The router may have closed while the read was in flight — never write after shutdown.
      if (signal.aborted) {
        return
      }
      await source.set(project(event, current), signal)
    },
  }
}
