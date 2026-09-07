import type { StateSource, WebAbortSignal } from "@plainworks/std"
import type { DecodedEvent } from "./event"
import type { EventSink } from "./sink"

/**
 * Fold a decoded event and the slot's current value into its next value. Returning the current value unchanged is a valid no-op (e.g. an event type this slot ignores).
 */
export type StateProjection<T, Value> = (
  event: DecodedEvent<T>,
  current: Value | undefined,
) => Value

/**
 * An {@link EventSink} that writes stream events into a single {@link StateSource} slot — the `memory` scope of `@plainworks/state` in the default composition, but any backend that satisfies the L0 `StateSource` seam. The sink writes **through** the state contract (`get` then `set`) rather than reaching into a store, so scoped state stays the one source of truth. Each delivery reads the current value, projects the next, and persists it; the router's serial drain makes the read-project-write atomic per event (no interleaving).
 */
export function createStateSink<T, Value>(
  source: StateSource<Value>,
  project: StateProjection<T, Value>,
): EventSink<T> {
  return {
    async deliver(event: DecodedEvent<T>, signal: WebAbortSignal): Promise<void> {
      const current = await source.get(signal)
      // The router may have closed while the read was in flight — never write after shutdown.
      if (signal.aborted) {
        return
      }
      await source.set(project(event, current), signal)
    },
  }
}
