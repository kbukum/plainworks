"use client"

import type { StandardSchemaV1, StateSerializer, StateSource } from "@plainworks/std"
import type { ReactNode } from "react"
import { type StateFieldFailure, StateSourceError } from "../../errors"
import type { Scope } from "../../scope/scope"
import { assertScopeAllowsSensitivity, type Sensitivity } from "../../scope/sensitivity"
import { jsonSerializer } from "../../scope/serializer"
import { createStore } from "../../store"
import { createSourceReconciler } from "./reconcile"
import { createScopedSurface, mergeActions, type Report, type ScopedInstance } from "./surface"

/** A single field in a {@link createScopedObject} composite: where it lives, its default, and how it encodes. */
export interface FieldDescriptor<Value> {
  /** The scope (backend) this field lives in — relocate the field by changing this one line. */
  readonly scope: Scope
  /** The field's default (its type source and the SSR/first-render seed). */
  readonly initial: Value
  /** The key within the scope's medium; defaults to the field name (optionally `namespace`-prefixed). */
  readonly key?: string
  /** Encode/decode for a string-backed scope; defaults to a JSON serializer. Ignored by `memory`. */
  readonly serializer?: StateSerializer<Value>
  /**
   * Optional Standard Schema validator for this field. When the field lives in a persisted
   * (untrusted) scope, supply one to validate the decoded value at the read boundary — a tampered
   * or wrong-shaped value becomes a typed `StateSourceError` instead of a fabricated `Value`.
   */
  readonly schema?: StandardSchemaV1<unknown, Value>
  /**
   * Marks this field a secret — rejected at construction unless its `scope` is memory-equivalent,
   * so a token can never be placed in `persistent`/`cookie`/`url`.
   */
  readonly sensitivity?: Sensitivity
}

/** A patch for a composite: a partial next value, or a function computing one from the previous whole. */
export type ObjectPatch<Values> = Partial<Values> | ((previous: Values) => Partial<Values>)

/** The imperative handle for a composite object, used outside the render path. */
export interface ScopedObjectApi<Values> {
  /** The current whole value (the synchronous mirror). */
  get(): Values
  /** Patch **only the named fields**, fanning each to its own scope; there is no whole-object replace. */
  set(patch: ObjectPatch<Values>): void
  /** Reset every field to its `initial` and clear each backend slot. */
  remove(): void
  /** Subscribe to changes; returns an unsubscribe. */
  subscribe(onChange: () => void): () => void
}

/** An optional named-actions factory (`{ set, get }` closed over), merged onto the {@link ScopedObjectApi}. */
export type ScopedObjectActions<Values, Actions extends object> = (
  api: ScopedObjectApi<Values>,
) => Actions

/** Configuration for {@link createScopedObject}: the per-field scopes, an optional namespace and actions. */
export interface ScopedObjectConfig<
  Values extends object,
  Actions extends object = Record<never, never>,
> {
  /** One {@link FieldDescriptor} per field; each field's value type is inferred from its `initial`. */
  readonly fields: { readonly [K in keyof Values]: FieldDescriptor<Values[K]> }
  /** Optional key prefix (`namespace:key`) so two composites can share a scope without colliding. */
  readonly namespace?: string
  /** Optional named actions merged onto the {@link ScopedObjectApi} handle. */
  readonly actions?: ScopedObjectActions<Values, Actions>
  /** Where a backend persistence failure (or multi-field aggregate) goes; defaults to out-of-band re-throw. */
  readonly onError?: (error: unknown) => void
}

/** Props for a composite `Provider` — seed any subset of fields for hydration. */
export interface ScopedObjectProviderProps<Values> {
  /** Server-provided per-field seeds (any subset); rendered first, then reconciled — no hydration flash. */
  readonly initialValues?: Partial<Values>
  readonly children: ReactNode
}

/**
 * The callable `use`-prefixed surface {@link createScopedObject} returns — identical in shape to
 * {@link import("./scoped-state").ScopedStateSurface}, so a composite and a single value are one
 * API to learn.
 */
export interface ScopedObjectSurface<Values, Handle> {
  /** Read the whole composite value. */
  (): Values
  /** Read a selected slice — re-renders only when the slice changes by reference. */
  <Slice>(selector: (value: Values) => Slice): Slice
  /** Owns a per-request set of backends + mirror (via `useRef`) and provides them to the subtree. */
  readonly Provider: (props: ScopedObjectProviderProps<Values>) => ReactNode
  /** The imperative handle bound to the nearest Provider (a hook — the instance is per-request). */
  readonly useApi: () => Handle
}

/** A resolved per-field spec, computed once at construction (secret guard, key, serializer). */
interface FieldSpec {
  readonly name: string
  readonly field: FieldDescriptor<unknown>
  readonly key: string
  readonly serializer: StateSerializer<unknown>
}

/** A pending per-field persistence, tagged with its field key for the aggregate error. */
interface FieldWrite {
  readonly key: string
  readonly op: Promise<void>
}

/**
 * Gather a fanned-out set of per-field writes and, on any failure, report a **typed aggregate**
 * ({@link StateSourceError}) naming the failed field keys with each cause preserved — no swallowed
 * error, no success-shaped partial write. `cause` holds the single failure when exactly one failed.
 */
function reportFieldFailures(writes: readonly FieldWrite[], report: Report, action: string): void {
  if (writes.length === 0) {
    return
  }
  void Promise.allSettled(writes.map((write) => write.op)).then((results) => {
    const failures: StateFieldFailure[] = []
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const write = writes[index]
        if (write !== undefined) {
          failures.push({ key: write.key, cause: result.reason })
        }
      }
    })
    if (failures.length === 0) {
      return
    }
    const names = failures.map((failure) => failure.key).join(", ")
    report(
      new StateSourceError(`Could not ${action} field(s): ${names}.`, {
        failures,
        cause: failures.length === 1 ? failures[0]?.cause : undefined,
      }),
    )
  })
}

/**
 * Compose **one logical object whose fields each live in a different scope** — the capability the
 * single-value surface cannot express. `createScopedObject({ fields })` assigns a scope per field
 * (whole-object-in-one-scope is the trivial case), returning the **same callable `use`-prefixed
 * shape** as {@link import("./scoped-state").createScopedState}:
 * `const usePrefs = createScopedObject({...})`, then `usePrefs((s) => s.theme)`,
 * `usePrefs.useApi()`, `usePrefs.Provider`.
 *
 * Writes are **patch-only** (`set({ theme: "dark" })`): a patch touches only the named fields,
 * fanning each to its own scope's {@link StateSource}. There is intentionally no whole-object
 * replace — no cross-medium transaction exists to honor. A multi-field patch that partly fails
 * raises a typed aggregate {@link StateSourceError} listing the failed field keys, each cause
 * preserved. Relocating a field across scopes is the one-line `scope:` change, with call sites
 * unchanged.
 */
export function createScopedObject<
  Values extends object,
  Actions extends object = Record<never, never>,
>(
  config: ScopedObjectConfig<Values, Actions>,
): ScopedObjectSurface<Values, ScopedObjectApi<Values> & Actions> {
  // Resolve every field once, at construction: run the secret guard (host-free, via scope
  // capabilities), fix the storage key (optionally namespaced), and pick the serializer.
  const specs: FieldSpec[] = Object.keys(config.fields).map((name) => {
    const field = config.fields[name as keyof Values] as FieldDescriptor<unknown>
    assertScopeAllowsSensitivity(`field "${name}"`, field.scope, field.sensitivity)
    const localKey = field.key ?? name
    const key = config.namespace === undefined ? localKey : `${config.namespace}:${localKey}`
    return { name, field, key, serializer: field.serializer ?? jsonSerializer<unknown>() }
  })

  const initials = Object.fromEntries(
    specs.map((spec) => [spec.name, spec.field.initial]),
  ) as Values

  type Handle = ScopedObjectApi<Values> & Actions

  const build = (
    seed: Partial<Values> | undefined,
    report: Report,
  ): ScopedInstance<Values, Handle> => {
    const sources = new Map<string, StateSource<unknown>>()
    const reconcilers = new Map<string, ReturnType<typeof createSourceReconciler>>()
    const seeded = { ...initials, ...(seed ?? {}) } as Values
    const store = createStore<Values>(() => seeded)
    for (const spec of specs) {
      const source = spec.field.scope.createSource({
        key: spec.key,
        serializer: spec.serializer,
        ...(spec.field.schema !== undefined ? { schema: spec.field.schema } : {}),
      })
      sources.set(spec.name, source)
      reconcilers.set(
        spec.name,
        createSourceReconciler({
          source,
          adopt: (value) =>
            store.setState((prev) => ({ ...prev, [spec.name]: value }) as Values, true),
          reset: () =>
            store.setState(
              (prev) => ({ ...prev, [spec.name]: spec.field.initial }) as Values,
              true,
            ),
          report,
        }),
      )
    }

    const base: ScopedObjectApi<Values> = {
      get: () => store.getState(),
      set: (patch) => {
        const previous = store.getState()
        const next = typeof patch === "function" ? patch(previous) : patch
        const keys = Object.keys(next)
        if (keys.length === 0) {
          return
        }
        // Reject unknown keys before touching the mirror: an unconfigured field has no backend, so
        // persisting it would be a success-shaped no-op. A `Map` lookup also means a prototype key
        // (`toString`, `constructor`, `__proto__`) is treated as unknown, not a spurious hit. Fail
        // with a typed error instead.
        const unknown = keys.filter((key) => !sources.has(key))
        if (unknown.length > 0) {
          report(
            new StateSourceError(`Unknown field(s): ${unknown.join(", ")}.`, {
              failures: unknown.map((key) => ({
                key,
                cause: new StateSourceError(`No field "${key}" is configured on this composite.`),
              })),
            }),
          )
          return
        }
        // Mark each touched field's write first (latest-wins vs an in-flight read), then optimistic
        // whole-mirror merge, then fan each named field to its own scope's backend.
        for (const key of keys) {
          reconcilers.get(key)?.markLocalWrite()
        }
        store.setState({ ...previous, ...next } as Values, true)
        const writes = keys.map((key) => ({
          key,
          op: sources.get(key)?.set((next as Record<string, unknown>)[key]) ?? Promise.resolve(),
        }))
        reportFieldFailures(writes, report, "persist")
      },
      remove: () => {
        for (const spec of specs) {
          reconcilers.get(spec.name)?.markLocalWrite()
        }
        store.setState({ ...initials } as Values, true)
        const writes = specs.map((spec) => ({
          key: spec.name,
          op: sources.get(spec.name)?.remove() ?? Promise.resolve(),
        }))
        reportFieldFailures(writes, report, "remove")
      },
      subscribe: (onChange) => store.subscribe(() => onChange()),
    }
    const api = mergeActions(base, config.actions)

    // Each field reconciles independently — latest-wins and removal-aware — into its slot of the
    // shared mirror; teardown stops every field's pull and external subscription.
    const connect: (report: Report) => () => void = () => {
      const teardowns = specs.map((spec) => reconcilers.get(spec.name)?.start()).filter(Boolean)
      return () => {
        for (const teardown of teardowns) {
          teardown?.()
        }
      }
    }
    return { store, api, connect }
  }

  const surface = createScopedSurface<Values, Handle, Partial<Values>>({
    build,
    ...(config.onError !== undefined ? { onError: config.onError } : {}),
  })
  function Provider({ initialValues, children }: ScopedObjectProviderProps<Values>): ReactNode {
    return surface.Provider(
      initialValues === undefined ? { children } : { initialValue: initialValues, children },
    )
  }
  return Object.assign(surface.useValue, {
    Provider,
    useApi: surface.useApi,
  }) as ScopedObjectSurface<Values, Handle>
}
