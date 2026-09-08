import type { PlainEvent, WebAbortSignal } from "@plainworks/std"
import type { InvalidateQueryFilters, QueryClient, QueryKey, Updater } from "@tanstack/query-core"
import { invalidateCache, writeQueryData } from "./routing"

/**
 * The cache action a routed event resolves to — either write the decoded payload into a key, or
 * invalidate a set of queries so they refetch. A router returns one of these (or `undefined` to ignore
 * the event); the sink executes it. This is the whole protocol-agnostic routing vocabulary: no
 * per-protocol event bus, just "set this" or "invalidate that".
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
      /** Which queries to invalidate (prefix match); omit to invalidate the whole cache. */
      readonly filters?: InvalidateQueryFilters
    }

/**
 * Map one decoded {@link PlainEvent} to the {@link QueryCacheAction} it should drive, or `undefined` to
 * drop it (an event type this sink ignores). Pure and synchronous — the routing decision is data, so it
 * is trivial to unit-test without a cache; the sink performs the effect.
 */
export type QueryEventRouter<TEvent extends PlainEvent = PlainEvent> = (
  event: TEvent,
) => QueryCacheAction | undefined

/**
 * A sink that folds decoded events into the query cache — the cache-side counterpart to `channel`'s
 * state sink. Both consume the **same neutral {@link PlainEvent} shape**, so one live stream can drive
 * scoped state and the query cache with no bespoke bus. `deliver` is async and honors `signal`: a slow
 * `invalidate` awaits its refetches (applying backpressure), and a delivery that arrives after the
 * owning stream tore down is dropped rather than mutating a cache the host has abandoned.
 */
export interface QueryEventSink<TEvent extends PlainEvent = PlainEvent> {
  /** Route `event` and apply the resulting cache action; a no-op when the router ignores it or `signal` has aborted. */
  deliver(event: TEvent, signal?: WebAbortSignal): Promise<void>
}

/**
 * Build a {@link QueryEventSink} that routes each event through `route` and applies the action to
 * `client`. The transport (a `channel` SSE/WS stream at the app layer) owns delivery order and
 * teardown; this sink owns only the fold into the cache. It never imports a transport — it is wired to
 * one at composition, keeping "Query is optional" true and the L2 layer free of sideways imports.
 */
export function createQueryEventSink<TEvent extends PlainEvent = PlainEvent>(
  client: QueryClient,
  route: QueryEventRouter<TEvent>,
): QueryEventSink<TEvent> {
  return {
    async deliver(event: TEvent, signal?: WebAbortSignal): Promise<void> {
      // The owning stream may have closed before this delivery ran — never mutate the cache post-teardown.
      if (signal?.aborted) {
        return
      }
      const action = route(event)
      // The router is user code and may have aborted the signal synchronously while deciding —
      // re-check before applying so a torn-down stream still never mutates the cache.
      if (action === undefined || signal?.aborted) {
        return
      }
      if (action.kind === "set") {
        writeQueryData<unknown>(client, action.queryKey, action.update)
        return
      }
      // Honor an abort that lands mid-invalidation: cancel the matching queries so a torn-down
      // stream stops the refetches instead of letting them mutate a cache the host has abandoned.
      if (signal !== undefined) {
        const onAbort = (): void => {
          void client.cancelQueries(action.filters)
        }
        signal.addEventListener("abort", onAbort, { once: true })
        try {
          await invalidateCache(client, action.filters)
        } finally {
          signal.removeEventListener("abort", onAbort)
        }
        return
      }
      await invalidateCache(client, action.filters)
    },
  }
}
