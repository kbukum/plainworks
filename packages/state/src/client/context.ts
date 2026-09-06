"use client"

import { createContext, createElement, type ReactNode, useContext, useRef } from "react"
import { useStore as useZustandStore } from "zustand/react"
import { StateError } from "../errors"
import { createStore, type Store, type StoreInitializer } from "../store"

/** Props for a store `Provider`. */
export interface StoreProviderProps<T> {
  /**
   * Server-provided state merged into the freshly created store before first render — the hydration
   * path (server computes initial state → factory → client hydrates). Omit for a client-only store.
   */
  readonly initialState?: Partial<T>
  readonly children: ReactNode
}

/** Options for {@link createStoreContext}. */
export interface StoreContextOptions<T> {
  /**
   * How a Provider's `initialState` merges into the initializer's state at store creation. Defaults
   * to a shallow spread — the right merge for plain-record state. Supply one when the state shape
   * is not a plain record (an array or class instance would lose its runtime shape to a spread) or
   * when hydration needs a deep merge.
   */
  readonly mergeInitialState?: (initial: T, serverState: Partial<T>) => T
}

/** The Provider + selector hooks returned by {@link createStoreContext} for one store shape. */
export interface StoreContext<T> {
  /** Owns a per-request store (via `useRef`) and provides it to the subtree. */
  readonly Provider: (props: StoreProviderProps<T>) => ReactNode
  /** Subscribe to a selected slice (or the whole state) of the nearest provided store. */
  readonly useStore: {
    (): T
    <Slice>(selector: (state: T) => Slice): Slice
  }
  /** The store instance itself, for imperative reads/writes outside the render path. */
  readonly useStoreApi: () => Store<T>
}

/**
 * Create a React binding for one store shape: a `Provider` plus selector hooks. The Provider builds
 * the store **once per mount via `useRef`** rather than a module-level singleton, so two concurrent
 * SSR requests each get an isolated store and never bleed state into one another.
 *
 * The selector hook delegates to Zustand's `useStore`, which compares snapshots by reference: select
 * primitives or reference-stable values (or wrap a derived object in `useShallow`) so a slice
 * re-renders only when it actually changes — returning a fresh object/array each call would loop.
 */
export function createStoreContext<T extends object>(
  initializer: StoreInitializer<T>,
  options?: StoreContextOptions<T>,
): StoreContext<T> {
  const Context = createContext<Store<T> | null>(null)
  const identity = (state: T): T => state
  const merge = options?.mergeInitialState ?? shallowMerge

  // Bake `initialState` into the store's *initial* state (not a post-creation `setState`) so the
  // hydrated value is what `getInitialState` returns — the value React reads as the server snapshot,
  // keeping SSR output and the first client render in sync.
  function build(initialState: Partial<T> | undefined): Store<T> {
    if (initialState === undefined) {
      return createStore(initializer)
    }
    return createStore<T>((set, get, api) => merge(initializer(set, get, api), initialState))
  }

  function Provider({ initialState, children }: StoreProviderProps<T>): ReactNode {
    const storeRef = useRef<Store<T> | null>(null)
    if (storeRef.current === null) {
      storeRef.current = build(initialState)
    }
    return createElement(Context.Provider, { value: storeRef.current }, children)
  }

  function useStoreApi(): Store<T> {
    const store = useContext(Context)
    if (store === null) {
      throw new StateError("useStore/useStoreApi must be called inside its matching <Provider>.")
    }
    return store
  }

  // Overloads (not a cast) carry the public types; the implementation keeps a single, uniform hook
  // call to satisfy the rules of hooks.
  function useStore(): T
  function useStore<Slice>(selector: (state: T) => Slice): Slice
  function useStore(selector?: (state: T) => unknown): unknown {
    const store = useStoreApi()
    return useZustandStore(store, selector ?? identity)
  }

  return { Provider, useStore, useStoreApi }
}

function shallowMerge<T extends object>(initial: T, serverState: Partial<T>): T {
  return { ...initial, ...serverState }
}
