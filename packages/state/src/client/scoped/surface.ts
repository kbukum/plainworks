"use client"

import { createContext, createElement, type ReactNode, useContext, useEffect, useRef } from "react"
import { StateError } from "../../errors"
import type { Store } from "../../store"
import { createBinding } from "../binding"

/**
 * Where a scoped backend failure goes. Writes are optimistic — the mirror updates immediately — so a
 * rejected persistence would otherwise be an unhandled rejection; a report routes it somewhere the
 * host can see it, never swallowed.
 */
export type Report = (error: unknown) => void

/**
 * The default report: surface the failure out of band as a rejected promise so it reaches the host's
 * unhandled-rejection path, never swallowed. It uses only the `Promise` language primitive — no
 * host-specific scheduler (`queueMicrotask` is not one of the universal runtime primitives this
 * React-without-DOM entry may assume) — so it is safe on every target runtime.
 */
export const defaultReport: Report = (error) => {
  void Promise.reject(error)
}

/**
 * The per-request pieces the {@link createScopedSurface} Provider owns: the mirror {@link Store}
 * React renders, the imperative `api` handle, and a `connect` that starts reconciling the backing
 * source(s) into the mirror and returns teardown. `build` produces one per mount.
 */
export interface ScopedInstance<Value, Handle> {
  /** The synchronous mirror React renders — seeded first, reconciled against the backend on mount. */
  readonly store: Store<Value>
  /** The imperative handle (`get`/`set`/`remove`/`subscribe` plus any named actions). */
  readonly api: Handle
  /** Begin reconciling the backend(s) into the mirror (client-only, in an effect); returns teardown. */
  readonly connect: (report: Report) => () => void
}

/** The callable selector hook a scoped surface exposes: whole value, or a selected slice. */
export interface ScopedHook<Value> {
  (): Value
  <Slice>(selector: (value: Value) => Slice): Slice
}

/** Props for a scoped `Provider` seeded by `initialValue` (a whole value or a per-field seed). */
export interface ScopedProviderProps<Seed> {
  /**
   * Server-provided seed for hydration. It is rendered on the server and on the first client render
   * (so markup matches), then reconciled against the backend once mounted — no hydration flash.
   */
  readonly initialValue?: Seed
  readonly children: ReactNode
}

/** The three pieces every scoped factory assembles into its callable `use`-prefixed hook. */
export interface AssembledSurface<Value, Handle, Seed> {
  /** The callable selector hook (front door). */
  readonly useValue: ScopedHook<Value>
  /** The per-request Provider boundary. */
  readonly Provider: (props: ScopedProviderProps<Seed>) => ReactNode
  /** The hook returning the imperative handle bound to the nearest Provider. */
  readonly useApi: () => Handle
}

/**
 * The engine-neutral heart shared by `createScopedState` (one value) and `createScopedObject` (a
 * per-field composite): both are the **same surface** — a callable selector hook, a per-request
 * `Provider`, and a `useApi` handle — differing only in how their {@link ScopedInstance} is built and
 * written. This assembles that surface once; the factory supplies `build`.
 *
 * The Provider builds the instance **once per mount via `useRef`** — never a module-level singleton —
 * so two concurrent SSR requests stay isolated, and runs `connect` in an effect (client-only) so SSR
 * touches no host and the first client render matches the server markup.
 *
 * The selector hook compares snapshots by reference: select a primitive or a reference-stable value
 * (or memoize with `createSelector`) so a slice re-renders only when it actually changes.
 */
export function createScopedSurface<Value, Handle, Seed>(params: {
  readonly build: (seed: Seed | undefined, report: Report) => ScopedInstance<Value, Handle>
  readonly onError?: Report
}): AssembledSurface<Value, Handle, Seed> {
  const report: Report = params.onError ?? defaultReport
  const binding = createBinding<Value>()
  const ApiContext = createContext<Handle | null>(null)

  function Provider({ initialValue, children }: ScopedProviderProps<Seed>): ReactNode {
    const ref = useRef<ScopedInstance<Value, Handle> | null>(null)
    if (ref.current === null) {
      ref.current = params.build(initialValue, report)
    }
    const instance = ref.current
    // The instance is stable (built once via the ref), so `connect` runs exactly once on mount and
    // tears down on unmount — reconcile plus external subscriptions, all owned here. A plain
    // `useEffect` keeps this shared surface DOM-free (React-without-DOM), so it runs on the browser
    // and React Native alike and never touches a host global to pick an effect variant.
    useEffect(() => instance.connect(report), [instance])

    return createElement(
      binding.Context.Provider,
      { value: instance.store },
      createElement(ApiContext.Provider, { value: instance.api }, children),
    )
  }

  function useApi(): Handle {
    const api = useContext(ApiContext)
    if (api === null) {
      throw new StateError("useApi must be called inside its matching scoped-state <Provider>.")
    }
    return api
  }

  const identity = (value: Value): unknown => value
  function useValue(selector?: (value: Value) => unknown): unknown {
    return binding.useStore(selector ?? identity)
  }

  return { useValue: useValue as ScopedHook<Value>, Provider, useApi }
}

/**
 * Merge an optional named-actions factory onto a base imperative handle — the `defineStore`-style
 * `({ set, get }) => actions` pattern, but on the handle rather than fused into the read hook. An
 * action name colliding with a base method wins, exactly as Zustand merges actions over state.
 */
export function mergeActions<Base extends object, Actions extends object>(
  base: Base,
  actions: ((base: Base) => Actions) | undefined,
): Base & Actions {
  // The runtime object carries the base methods with the (possibly empty) action set merged on top;
  // the declared `Base & Actions` is exactly that composition of its two verified halves.
  return (actions === undefined ? base : { ...base, ...actions(base) }) as Base & Actions
}
