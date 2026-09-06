import {
  createStore as createVanillaStore,
  type StateCreator,
  type StoreApi,
} from "zustand/vanilla"

/**
 * A framework-agnostic store — the blessed default, backed by Zustand's vanilla core so it is usable
 * outside React (a plain subscribable state container). `getInitialState` returns the state the
 * store was created with, which is what a `useSyncExternalStore` server snapshot reads.
 */
export type Store<T> = StoreApi<T>

/**
 * How a store's state (and its actions) are produced. The `(set, get, store) => state` form lets
 * actions live alongside state — e.g. `(set) => ({ count: 0, inc: () => set((s) => ({ count: s.count + 1 })) })`.
 */
export type StoreInitializer<T> = StateCreator<T>

/**
 * Build a fresh store from an initializer. This is a **factory, never a module-level singleton**:
 * every call returns an isolated store, so a per-request/per-render caller cannot leak state across
 * SSR requests. Server-safe — imports no React or DOM.
 */
export function createStore<T>(initializer: StoreInitializer<T>): Store<T> {
  return createVanillaStore<T>()(initializer)
}
