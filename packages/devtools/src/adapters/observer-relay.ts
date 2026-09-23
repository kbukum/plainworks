import type { StatusIndicator } from "../protocol"
import type { SourceObserver } from "../source"

/**
 * A {@link SourceObserver} facade a flow adapter can publish through **before** its source is
 * registered with a session. HTTP and Connect interceptors, channel callbacks, and observability
 * sinks are all constructed and handed to their runtime *before* the devtools source connects, so
 * the adapter needs a stable sink to write to from the first instrumented call.
 *
 * The relay forwards to the bound observer once {@link ObserverRelay.bind} runs and is a safe no-op
 * until then — instrumentation never throws and pre-connect events are dropped rather than buffered
 * unboundedly. Indicators are last-write-wins per id and replayed on bind, so a source that
 * connects after its runtime is already live still surfaces current status (e.g. a channel already
 * `open`) instead of a stale blank.
 */
export interface ObserverRelay extends SourceObserver {
  /**
   * Whether an observer is currently bound. Detail retention is gated on this so an adapter never
   * holds captured detail for an event that is dropped (before registration or after disposal).
   */
  readonly active: boolean
  /** Attach the session's observer and replay the latest indicator per id to it. */
  bind(observer: SourceObserver): void
  /** Detach the observer; subsequent calls are dropped until the next bind. */
  unbind(): void
}

/** Create an unbound {@link ObserverRelay}. */
export function createObserverRelay(): ObserverRelay {
  let bound: SourceObserver | undefined
  const latestIndicators = new Map<string, StatusIndicator>()

  const relay: ObserverRelay = {
    get active() {
      return bound !== undefined
    },
    emit(event) {
      bound?.emit(event)
    },
    indicate(indicator) {
      latestIndicators.set(indicator.id, indicator)
      bound?.indicate(indicator)
    },
    fail(error) {
      bound?.fail(error)
    },
    recover() {
      bound?.recover()
    },
    bind(observer) {
      bound = observer
      for (const indicator of latestIndicators.values()) {
        observeSafely(relay, () => observer.indicate(indicator))
      }
    },
    unbind() {
      bound = undefined
    },
  }
  return relay
}

/**
 * Run an observation body, isolating any fault from the code being observed. A devtools adapter is
 * a bystander: a throw from an `emit`/`indicate` (e.g. a consumer-supplied bridge whose `post`
 * throws) must never become the outcome the instrumented client returns or the operational path
 * sees. The fault is routed to {@link SourceObserver.fail} instead, and even that is guarded so
 * nothing escapes.
 */
export function observeSafely(relay: ObserverRelay, body: () => void): void {
  try {
    body()
  } catch (error) {
    try {
      relay.fail(error)
    } catch {
      // The failure channel itself faulted; there is nothing safe left to do but drop it.
    }
  }
}
