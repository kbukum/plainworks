"use client"

import {
  type Context,
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useSyncExternalStore,
} from "react"
import { StateConfigError, StateError } from "../errors"
import type { Store } from "../store"

/**
 * Props for a bring-your-own-store `Provider`: the {@link Store} is **required** (there is no
 * default engine to fall back to), so omitting it is a compile error rather than a render-time
 * failure. Build the store per request/render so it stays SSR-safe; the Provider adopts it as-is.
 */
export interface SuppliedStoreProviderProps<T> {
  readonly store: Store<T>
  readonly children: ReactNode
}

/** The selector hooks every store binding shares. */
export interface StoreHooks<T> {
  /** Subscribe to a selected slice (or the whole state) of the nearest provided store. */
  readonly useStore: {
    (): T
    <Slice>(selector: (state: T) => Slice): Slice
  }
  /** The store instance itself, for imperative reads/writes outside the render path. */
  readonly useStoreApi: () => Store<T>
}

/** An engine-neutral binding: a Provider that adopts a supplied {@link Store}, plus selector hooks. */
export interface SuppliedStoreContext<T> extends StoreHooks<T> {
  /** Provides a bring-your-own store to the subtree; the `store` prop is required. */
  readonly Provider: (props: SuppliedStoreProviderProps<T>) => ReactNode
}

/** The React Context plus selector hooks a binding is built from. */
export interface StoreBinding<T> extends StoreHooks<T> {
  readonly Context: Context<Store<T> | null>
}

/**
 * The engine-neutral heart of the React binding: a Context plus `useStore`/`useStoreApi` that drive
 * React's own `useSyncExternalStore` over the owned {@link Store} seam. This module imports **no**
 * default engine (`createStore`), so a binding built only from a bring-your-own store never pulls
 * the default engine into the `./client` graph.
 */
export function createBinding<T>(): StoreBinding<T> {
  const StoreContext = createContext<Store<T> | null>(null)
  const identity = (state: T): T => state

  function useStoreApi(): Store<T> {
    const store = useContext(StoreContext)
    if (store === null) {
      throw new StateError("useStore/useStoreApi must be called inside its matching <Provider>.")
    }
    return store
  }

  // Overloads (not a cast) carry the public types; the implementation keeps a single, uniform hook
  // call to satisfy the rules of hooks.
  function useStore(): T
  function useStore<Slice>(selector: (state: T) => Slice): Slice
  function useStore(selector: (state: T) => unknown = identity): unknown {
    const store = useStoreApi()
    const subscribe = useCallback(
      (onStoreChange: () => void) => store.subscribe(onStoreChange),
      [store],
    )
    // Cache the selected slice by (selector, state) so `useSyncExternalStore` sees a stable reference
    // across the reads within a render — an allocating selector returns the same value until the
    // state reference or the selector itself changes, instead of a fresh reference that reads as an
    // update and loops.
    const cache = useRef<{ selector: (state: T) => unknown; state: T; slice: unknown } | null>(null)
    const getSnapshot = (): unknown => {
      const state = store.getState()
      const previous = cache.current
      if (previous !== null && previous.selector === selector && Object.is(previous.state, state)) {
        return previous.slice
      }
      const slice = selector(state)
      cache.current = { selector, state, slice }
      return slice
    }
    // Cache the server snapshot the same way. The initial state never changes, so an allocating
    // selector must still return one stable reference across React's repeated SSR/hydration reads —
    // selecting afresh each call would trip `useSyncExternalStore`'s cached-snapshot requirement.
    const serverCache = useRef<{ selector: (state: T) => unknown; slice: unknown } | null>(null)
    const getServerSnapshot = (): unknown => {
      const previous = serverCache.current
      if (previous !== null && previous.selector === selector) {
        return previous.slice
      }
      const slice = selector(store.getInitialState())
      serverCache.current = { selector, slice }
      return slice
    }
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  }

  return { Context: StoreContext, useStore, useStoreApi }
}

/**
 * Create an engine-neutral React binding for one store shape: a `Provider` that adopts a
 * bring-your-own {@link Store} plus selector hooks — with **zero dependency on the default engine**
 * (this path imports no `createStore`). Build the store per request so two concurrent SSR requests
 * stay isolated; the Provider adopts it as-is. Use {@link import("./context").createStoreContext}
 * instead when you want the built-in default engine and `initialState` hydration.
 *
 * The selector hook compares snapshots by reference: select primitives or reference-stable values
 * (or memoize a derived object with `createSelector`) so a slice re-renders only when it actually
 * changes — returning a fresh object/array each call would loop.
 */
export function createSuppliedStoreContext<T>(): SuppliedStoreContext<T> {
  const { Context: StoreContext, useStore, useStoreApi } = createBinding<T>()
  function Provider({ store, children }: SuppliedStoreProviderProps<T>): ReactNode {
    // Type-required, but guarded for JavaScript callers that omit it.
    if (store === undefined) {
      throw new StateConfigError(
        "<Provider> requires a `store`; build one per request and pass it.",
      )
    }
    return createElement(StoreContext.Provider, { value: store }, children)
  }
  return { Provider, useStore, useStoreApi }
}
