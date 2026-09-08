"use client"

import type { StateCapabilities, StateSource } from "@plainworks/std"
import { StateSourceError } from "../../errors"
import type { Scope, SourceSpec } from "../../scope/scope"
import { createStringSource, type StringBackend } from "./string-source"

/** Which Web Storage a scope binds — `localStorage` (persistent) or `sessionStorage` (session). */
export type WebStorageKind = "persistent" | "session"

/**
 * The read/write subset of the Web Storage API a scope uses. Injectable so tests (and non-browser
 * hosts) supply their own store instead of the host `localStorage`/`sessionStorage`.
 */
export interface WebStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Options for {@link createWebStorageScope}. */
export interface WebStorageScopeOptions {
  /** Which host store the default resolver reads. */
  readonly kind: WebStorageKind
  /** Inject the storage (tests, SSR); defaults to the matching host Web Storage, with a typed error when absent. */
  readonly storage?: WebStorageLike
  /**
   * Inject cross-tab change notifications for a key. Defaults to the host `storage` event for the
   * `persistent` kind (`localStorage` broadcasts across tabs); `sessionStorage` is per-tab, so its
   * default is no external signal.
   */
  readonly subscribeStorageEvents?: (key: string, onChange: () => void) => () => void
}

const CAPABILITIES: Record<WebStorageKind, StateCapabilities> = {
  // Both survive a reload; only `localStorage` is observable across tabs of the same origin.
  // Neither is available at import (there is no host during SSR), and neither is sent to the
  // server.
  persistent: {
    access: "sync",
    authority: "local",
    durable: true,
    sharedAcrossTabs: true,
    sentToServer: false,
    availableAtImport: false,
  },
  session: {
    access: "sync",
    authority: "local",
    durable: true,
    sharedAcrossTabs: false,
    sentToServer: false,
    availableAtImport: false,
  },
}

function resolveHostStorage(kind: WebStorageKind): WebStorageLike {
  // Mirror `http`'s `resolveGlobalFetch`: use the platform primitive directly, fail with a typed
  // error naming the injection escape hatch when it is absent (SSR, a non-browser runtime).
  const storage = kind === "persistent" ? globalThis.localStorage : globalThis.sessionStorage
  if (storage == null) {
    const name = kind === "persistent" ? "localStorage" : "sessionStorage"
    throw new StateSourceError(
      `No ${name} is available; pass options.storage to build this scope off the host.`,
    )
  }
  return storage
}

function defaultStorageEvents(
  kind: WebStorageKind,
): ((key: string, onChange: () => void) => () => void) | undefined {
  // Only `localStorage` broadcasts across tabs, and only when a window exists to listen.
  if (kind !== "persistent" || typeof window === "undefined") {
    return undefined
  }
  return (key, onChange) => {
    const area = globalThis.localStorage
    const handler = (event: StorageEvent): void => {
      // A `storage` event fires for every area of the origin, so match `storageArea` as well as the
      // key — otherwise a same-key `sessionStorage` change would wrongly re-read this local slot. A
      // `storage.clear()` surfaces as `key === null`; scope it to this store's area too.
      if (event.storageArea !== null && event.storageArea !== area) {
        return
      }
      if (event.key === key || event.key === null) {
        onChange()
      }
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }
}

/**
 * Build a Web Storage scope — `persistent` (`localStorage`) or `session` (`sessionStorage`). Host
 * access is deferred to the first read/write (inside the surface's client-only `connect`), so both
 * importing the scope and building its source during SSR touch no storage. A caller injects
 * `storage`/`subscribeStorageEvents` to test the scope without a browser, exactly as `http` injects
 * `fetch`.
 *
 * Store only **non-secret** state here — the value is world-readable to any script on the origin.
 */
export function createWebStorageScope(options: WebStorageScopeOptions): Scope {
  const { kind } = options
  return {
    name: kind,
    capabilities: CAPABILITIES[kind],
    createSource<Value>(spec: SourceSpec<Value>): StateSource<Value> {
      // Resolve the host lazily on first use, not at construction: the Provider builds the source
      // during render (SSR included), but reads/writes only fire from the client-only `connect`
      // effect and event handlers — so the server never touches storage and never throws.
      let cached: WebStorageLike | undefined
      const storage = (): WebStorageLike => (cached ??= options.storage ?? resolveHostStorage(kind))
      const events = options.subscribeStorageEvents ?? defaultStorageEvents(kind)
      const backend: StringBackend = {
        read: () => storage().getItem(spec.key),
        write: (raw) => storage().setItem(spec.key, raw),
        clear: () => storage().removeItem(spec.key),
        ...(events !== undefined
          ? { subscribeExternal: (onChange: () => void) => events(spec.key, onChange) }
          : {}),
      }
      return createStringSource({
        capabilities: CAPABILITIES[kind],
        serializer: spec.serializer,
        backend,
        medium: `${kind} Web Storage`,
        ...(spec.schema !== undefined ? { schema: spec.schema } : {}),
      })
    },
  }
}

/** The **persistent** scope: `localStorage`-backed, durable, observable across tabs. Non-secret only. */
export const persistentScope: Scope = createWebStorageScope({ kind: "persistent" })

/** The **session** scope: `sessionStorage`-backed, durable within the tab session, not cross-tab. */
export const sessionScope: Scope = createWebStorageScope({ kind: "session" })
