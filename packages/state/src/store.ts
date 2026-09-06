import {
  createStore as createVanillaStore,
  type StateCreator,
  type StoreApi,
} from "zustand/vanilla"

/**
 * A state patch: a partial next state, or a function computing one from the current state. The
 * function form may return a full replacement — `setState(fn, true)` swaps the whole state.
 */
export type StatePatch<State> = Partial<State> | ((state: State) => State | Partial<State>)

/**
 * Apply a change to a {@link Store}. The default merges a patch into the current state; the
 * `replace: true` overload swaps the whole state (required for a non-record state, e.g. a primitive
 * or an array, where a partial merge is meaningless). The replacement may be a value or a function
 * computing the next whole state from the current one — `setState(fn, true)`.
 */
export interface StoreSet<State> {
  (patch: StatePatch<State>, replace?: false): void
  (state: State | ((state: State) => State), replace: true): void
}

/**
 * A framework-agnostic store — a plain subscribable state container usable outside React. This is
 * **plainworks-owned**: the public surface never names the underlying engine, so the default engine
 * can change without a breaking change and consumers are not coupled to it. `getInitialState`
 * returns the creation-time state, which is what a `useSyncExternalStore` server snapshot reads.
 *
 * **Snapshots are immutable.** Every update must publish a *new* state reference rather than mutate
 * the existing object in place; `getState()` between two `subscribe` notifications returns a stable
 * reference. `useSyncExternalStore` bindings (and {@link toAdapter}) detect change with `Object.is`
 * on that reference and cache the selected slice against it — an in-place mutation would notify
 * subscribers while leaving the reference unchanged, so the binding would serve a stale slice. A
 * bring-your-own {@link Store} must honor this contract.
 */
export interface Store<State> {
  /** The current live state — a new reference after every update (never mutated in place). */
  getState(): State
  /** The creation-time state — stable across updates; the server/first-hydration snapshot. */
  getInitialState(): State
  /** Merge a patch (or replace the whole state) and notify subscribers. */
  setState: StoreSet<State>
  /** Register a listener; returns an unsubscribe that must be called exactly once to detach. */
  subscribe(listener: (state: State, previous: State) => void): () => void
}

/**
 * How a store's state (and its actions) are produced. The `(set, get, store) => state` form lets
 * actions live alongside state — e.g. `(set) => ({ count: 0, inc: () => set((s) => ({ count: s.count + 1 })) })`.
 * Owned by plainworks (no engine type leaks into it); {@link defineStore} is the ergonomic way to
 * build one from separate `state` and `actions`.
 */
export type StoreInitializer<State> = (
  set: StoreSet<State>,
  get: () => State,
  store: Store<State>,
) => State

/**
 * Build a fresh store from an initializer. This is a **factory, never a module-level singleton**:
 * every call returns an isolated store, so a per-request/per-render caller cannot leak state across
 * SSR requests. Server-safe — imports no React or DOM.
 *
 * Zustand's vanilla core is the default engine, kept entirely behind the owned {@link Store} seam:
 * its branded types never reach the public surface, so the engine is swappable without a break.
 */
export function createStore<State>(initializer: StoreInitializer<State>): Store<State> {
  // Engine boundary: Zustand's vanilla store structurally satisfies the owned `Store` contract, and
  // the owned initializer matches Zustand's `StateCreator`. The casts confine Zustand's branded
  // types to this call so they never leak past the returned `Store<State>`.
  const engine: StoreApi<State> = createVanillaStore<State>()(initializer as StateCreator<State>)
  return engine as Store<State>
}
