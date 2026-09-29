import type { CacheTarget, EventSink, PlainEvent } from "@plainworks/std/seam"
import type { WebAbortSignal } from "@plainworks/std/web"
import type { QueryClient, QueryKey, Updater } from "@tanstack/query-core"
import { createCacheInvalidator } from "./invalidator"
import { writeQueryData } from "./routing"

/**
 * The cache action a routed event resolves to — either write the decoded payload into a key, or
 * invalidate a set of queries so they refetch. A router returns one of these (or `undefined` to
 * ignore the event); the sink executes it. This is the whole protocol-agnostic routing vocabulary:
 * no per-protocol event bus, just "set this" or "invalidate that".
 */
export type QueryCacheAction =
  | {
      readonly kind: "set"
      /** Key to write. */
      readonly queryKey: QueryKey
      /** The next value, or a `(previous) => next` fold over the currently-cached value. */
      readonly update: Updater<unknown, unknown>
    }
  | {
      readonly kind: "invalidate"
      /** Which queries to invalidate (a prefix unless `exact`); omit to invalidate the whole cache. */
      readonly target?: CacheTarget
    }

/**
 * Map one decoded {@link PlainEvent} to the {@link QueryCacheAction} it should drive, or
 * `undefined` to drop it (an event type this sink ignores). Pure and synchronous — the routing
 * decision is data, so it is trivial to unit-test without a cache; the sink performs the effect.
 */
export type QueryEventRouter<TEvent extends PlainEvent = PlainEvent> = (
  event: TEvent,
) => QueryCacheAction | undefined

/**
 * Build an {@link EventSink} that folds decoded events into the query cache — the cache-side
 * counterpart to `channel`'s state sink. Both are the **same {@link EventSink} contract over the
 * same {@link PlainEvent} shape**, so one live stream drives scoped state and the query cache from
 * a single router with no bespoke bus. `deliver` honors `signal`: a slow `invalidate` awaits its
 * refetches (applying backpressure), and a delivery whose signal has aborted is dropped rather than
 * mutating a cache the host has abandoned.
 *
 * The transport (a `channel` SSE/WS stream at the app layer) owns delivery order and teardown; this
 * sink owns only the fold into the cache. It never imports a transport — it is wired to one at
 * composition, keeping "Query is optional" true and the L2 layer free of sideways imports.
 */
export function createQueryEventSink<TEvent extends PlainEvent = PlainEvent>(
  client: QueryClient,
  route: QueryEventRouter<TEvent>,
): EventSink<TEvent> {
  const invalidator = createCacheInvalidator(client)
  return {
    async deliver(event: TEvent, signal: WebAbortSignal): Promise<void> {
      // The owning stream may have closed before this delivery ran — never mutate the cache
      // post-teardown.
      if (signal.aborted) {
        return
      }
      const action = route(event)
      // The router is user code and may have aborted the signal synchronously while deciding —
      // re-check before applying so a torn-down stream still never mutates the cache.
      if (action === undefined || signal.aborted) {
        return
      }
      if (action.kind === "set") {
        writeQueryData<unknown>(client, action.queryKey, action.update)
        return
      }
      // An abort that lands mid-invalidation cancels the refetches, so a torn-down stream never
      // mutates a cache the host has abandoned.
      await invalidator.invalidate(action.target, { signal })
    },
  }
}
