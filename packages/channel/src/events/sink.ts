import type { WebAbortSignal } from "@plainworks/std"
import type { DecodedEvent } from "./event"

/**
 * A consumer of decoded events. The router drains its bounded queue to each sink **serially**, awaiting an async `deliver` before the next event — so a slow sink applies backpressure instead of letting an unbounded backlog build. The built-in sink writes into scoped state ({@link createStateSink}); any custom consumer implements this same seam.
 */
export interface EventSink<T = unknown> {
  /**
   * Handle one decoded event; may be async, in which case the router awaits it before the next. `signal` aborts when the router closes — an async sink should cancel its in-flight work on it rather than run past shutdown.
   */
  deliver(event: DecodedEvent<T>, signal: WebAbortSignal): void | Promise<void>
}
