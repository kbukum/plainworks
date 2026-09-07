"use client"

import type { StandardSchemaV1, StateSerializer, StateSource } from "@plainworks/std"
import type { ReactNode } from "react"
import type { Scope } from "../../scope/scope"
import { jsonSerializer } from "../../scope/serializer"
import { createStore } from "../../store"
import { createSourceReconciler } from "./reconcile"
import { assertScopeAllowsSensitivity, type Sensitivity } from "./sensitivity"
import { createScopedSurface, mergeActions, type Report, type ScopedInstance } from "./surface"

/**
 * How a value's next state is expressed on {@link ScopedStateApi.set} — a value or an updater. A
 * function argument is always treated as `(previous) => next`, matching React's `useState` setter. A
 * value whose own type is a function therefore cannot be assigned directly (it would be *invoked*);
 * wrap function-valued state in a holder object (`{ fn }`) or model it in `memory` where identity is
 * preserved.
 */
export type ScopedSetter<Value> = Value | ((previous: Value) => Value)

/** The imperative handle for a scoped value, used outside the render path (event handlers, effects). */
export interface ScopedStateApi<Value> {
  /** The current value (the synchronous mirror), never a pending read. */
  get(): Value
  /** Optimistically update the mirror and persist the whole value to the backend. */
  set(next: ScopedSetter<Value>): void
  /** Reset to the configured `initial` and clear the backend slot. */
  remove(): void
  /** Subscribe to value changes; returns an unsubscribe. */
  subscribe(onChange: () => void): () => void
}

/** An optional named-actions factory (`{ set, get }` closed over), merged onto the {@link ScopedStateApi}. */
export type ScopedStateActions<Value, Actions extends object> = (
  api: ScopedStateApi<Value>,
) => Actions

/** Configuration for {@link createScopedState}: which scope holds the value, its key, and its default. */
export interface ScopedStateConfig<Value, Actions extends object = Record<never, never>> {
  /** The scope (backend) the value lives in — swap this one field to relocate it. */
  readonly scope: Scope
  /** Stable key naming the value within the scope's medium. */
  readonly key: string
  /** The default used before the backend has a value (and the SSR/first-render snapshot). */
  readonly initial: Value
  /** Encode/decode for a string-backed scope; defaults to a JSON serializer. Ignored by `memory`. */
  readonly serializer?: StateSerializer<Value>
  /**
   * Optional Standard Schema validator. A persisted scope (`persistent`/`session`/`cookie`/`url`) is
   * an **untrusted** medium — supply a schema to validate a decoded value at the read boundary; a
   * tampered or wrong-shaped value then becomes a typed `StateSourceError` (routed to `onError`)
   * instead of a fabricated `Value`. Unnecessary for `memory` (it holds the live typed reference).
   */
  readonly schema?: StandardSchemaV1<unknown, Value>
  /**
   * Marks the value a secret — rejected at construction unless `scope` is memory-equivalent (the
   * in-memory access-token fallback), so a token can never be placed in `persistent`/`cookie`/`url`.
   */
  readonly sensitivity?: Sensitivity
  /** Optional named actions merged onto the {@link ScopedStateApi} handle. */
  readonly actions?: ScopedStateActions<Value, Actions>
  /**
   * Where a backend persistence failure goes. A write is optimistic — the mirror updates immediately
   * — so a rejected `source.set` would otherwise be an unhandled rejection; by default it is re-thrown
   * asynchronously (surfaced to the host's error handling, never swallowed). Supply this to route it.
   */
  readonly onError?: (error: unknown) => void
}

/** Props for a scoped-state `Provider`. */
export interface ScopedStateProviderProps<Value> {
  /**
   * Server-provided value for hydration. It is rendered on the server and on the first client render
   * (so markup matches), then reconciled against the backend once mounted — no hydration flash.
   */
  readonly initialValue?: Value
  readonly children: ReactNode
}

/**
 * The callable `use`-prefixed surface {@link createScopedState} returns — the binding **is** the
 * subscribing hook (`const useThing = createScopedState(...)`, then `useThing(selector)`), exactly
 * like Zustand's `create`. `Provider` is the per-request boundary; `useApi` is the imperative handle.
 */
export interface ScopedStateSurface<Value, Handle> {
  /** Read the whole value. */
  (): Value
  /** Read a selected slice — re-renders only when the slice changes by reference. */
  <Slice>(selector: (value: Value) => Slice): Slice
  /** Owns a per-request backend + mirror (via `useRef`) and provides them to the subtree. */
  readonly Provider: (props: ScopedStateProviderProps<Value>) => ReactNode
  /** The imperative handle bound to the nearest Provider (a hook — the instance is per-request). */
  readonly useApi: () => Handle
}

/**
 * Create a scoped-state binding: **one consumer surface**, parameterized by scope. The returned value
 * **is the subscribing hook** — `const useTheme = createScopedState({...})`, then `useTheme()` or
 * `useTheme((v) => v.slice)` — with `useTheme.Provider` and `useTheme.useApi()` hung on it, exactly
 * like Zustand's `create`. Reading the same value whether it is held in `memory`, `persistent`,
 * `cookie`, `url`, or a future `remote` scope is the single `scope:` change, not a call-site rewrite.
 *
 * A scoped value is the **composition of two seams**: a {@link StateSource} *backend* (the scope,
 * where the value lives) feeding a mirror {@link Store} driven through the React *binding*
 * (`useSyncExternalStore`). Writes update the mirror immediately and persist to the backend; a change
 * from the backend (another tab, a navigation, a remote push) flows back into the mirror.
 */
export function createScopedState<Value, Actions extends object = Record<never, never>>(
  config: ScopedStateConfig<Value, Actions>,
): ScopedStateSurface<Value, ScopedStateApi<Value> & Actions> {
  assertScopeAllowsSensitivity("value", config.scope, config.sensitivity)
  const { scope, key, initial } = config
  const serializer = config.serializer ?? jsonSerializer<Value>()

  type Handle = ScopedStateApi<Value> & Actions

  const build = (seed: Value | undefined, report: Report): ScopedInstance<Value, Handle> => {
    const source: StateSource<Value> = scope.createSource<Value>({
      key,
      serializer,
      ...(config.schema !== undefined ? { schema: config.schema } : {}),
    })
    const store = createStore<Value>(() => (seed !== undefined ? seed : initial))
    const reconciler = createSourceReconciler<Value>({
      source,
      adopt: (value) => store.setState(value, true),
      reset: () => store.setState(initial, true),
      report,
    })
    const base: ScopedStateApi<Value> = {
      get: () => store.getState(),
      set: (next) => {
        const value =
          typeof next === "function" ? (next as (previous: Value) => Value)(store.getState()) : next
        // Mark the local write first so a read already in flight cannot regress it (latest-wins).
        reconciler.markLocalWrite()
        store.setState(value, true)
        source.set(value).catch(report)
      },
      remove: () => {
        reconciler.markLocalWrite()
        store.setState(initial, true)
        source.remove().catch(report)
      },
      subscribe: (onChange) => store.subscribe(() => onChange()),
    }
    const api = mergeActions(base, config.actions)
    // Reconcile once on mount (the client's stored value may differ from the SSR seed), then stay in
    // sync with external changes — latest-wins and removal-aware, owned by the reconciler.
    const connect: (report: Report) => () => void = () => reconciler.start()
    return { store, api, connect }
  }

  const surface = createScopedSurface<Value, Handle, Value>({
    build,
    ...(config.onError !== undefined ? { onError: config.onError } : {}),
  })
  return Object.assign(surface.useValue, {
    Provider: surface.Provider,
    useApi: surface.useApi,
  }) as ScopedStateSurface<Value, Handle>
}
