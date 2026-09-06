"use client"

import { createElement, type ReactNode, useRef } from "react"
import { StateConfigError } from "../errors"
import { createStore, type Store, type StoreInitializer } from "../store"
import { createBinding, type StoreHooks } from "./binding"

/** Props for a default-engine store `Provider`. */
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
export interface StoreContext<T> extends StoreHooks<T> {
  /** Owns a per-request store (via `useRef`) and provides it to the subtree. */
  readonly Provider: (props: StoreProviderProps<T>) => ReactNode
}

/**
 * Create a React binding backed by the **default engine**: a `Provider` plus selector hooks. The
 * Provider builds the store **once per mount via `useRef`** rather than a module-level singleton, so
 * two concurrent SSR requests each get an isolated store and never bleed state into one another;
 * `initialState` is the server → client hydration path.
 *
 * To bring your own store engine instead — with zero dependency on the default — use
 * {@link import("./binding").createSuppliedStoreContext} and pass a per-request `store`.
 *
 * The selector hook compares snapshots by reference: select primitives or reference-stable values
 * (or memoize a derived object with `createSelector`) so a slice re-renders only when it actually
 * changes — returning a fresh object/array each call would loop.
 */
export function createStoreContext<T extends object>(
  initializer: StoreInitializer<T>,
  options?: StoreContextOptions<T>,
): StoreContext<T> {
  // Type-required, but guarded for JavaScript callers: without an initializer there is no default
  // store to build. Bring-your-own callers use `createSuppliedStoreContext()` instead.
  if (initializer === undefined) {
    throw new StateConfigError(
      "createStoreContext requires an initializer; use createSuppliedStoreContext() to bring your own store.",
    )
  }
  const { Context, useStore, useStoreApi } = createBinding<T>()
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

  return { Provider, useStore, useStoreApi }
}

function shallowMerge<T extends object>(initial: T, serverState: Partial<T>): T {
  return { ...initial, ...serverState }
}
