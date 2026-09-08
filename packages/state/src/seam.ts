import type { Store } from "./store"

/**
 * The thin client-state seam — the `useSyncExternalStore`-shaped contract a consumer implements to
 * bring their own store instead of the blessed Zustand default. React (or any equivalent host)
 * wires it directly:
 * `useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getServerSnapshot)`.
 *
 * `getServerSnapshot` returns the value used during SSR/hydration, kept stable so the first client
 * render matches the server output.
 */
export interface StateAdapter<Snapshot> {
  /** Register `onStoreChange`; returns an unsubscribe that must be called exactly once to detach. */
  subscribe(onStoreChange: () => void): () => void
  /** The current client-side snapshot. */
  getSnapshot(): Snapshot
  /** The snapshot used on the server and for the first hydration render. */
  getServerSnapshot(): Snapshot
}

/**
 * Bridge the blessed {@link Store} into the {@link StateAdapter} seam for a selected slice, so a
 * store built with `createStore` can drive a raw `useSyncExternalStore` (or any seam consumer)
 * without depending on the React binding. The client snapshot reads live state; the server snapshot
 * reads the store's initial state.
 *
 * Snapshots are cached by state reference, as `useSyncExternalStore` requires: an allocating
 * selector (e.g. `state => ({ count: state.count })`) returns the same snapshot across reads until
 * the underlying state actually changes, instead of a fresh reference that reads as an update.
 */
export function toAdapter<T, Snapshot>(
  store: Store<T>,
  selector: (state: T) => Snapshot,
): StateAdapter<Snapshot> {
  let lastState = store.getState()
  let lastSnapshot = selector(lastState)
  // The initial state never changes, so the server snapshot is selected once, up front.
  const serverSnapshot = selector(store.getInitialState())
  return {
    subscribe: (onStoreChange) => store.subscribe(onStoreChange),
    getSnapshot: () => {
      const state = store.getState()
      // `Object.is`, matching Zustand's own change detection: `0`→`-0` counts as a change (never
      // serve a stale snapshot after Zustand notified), while `NaN`→`NaN` is stable (no re-select).
      if (!Object.is(state, lastState)) {
        lastState = state
        lastSnapshot = selector(state)
      }
      return lastSnapshot
    },
    getServerSnapshot: () => serverSnapshot,
  }
}
