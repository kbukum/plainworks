import type { StateCapabilities, StateSource } from "@plainworks/std"
import {
  hashKey,
  type QueryCacheNotifyEvent,
  type QueryClient,
  type QueryKey,
  QueryObserver,
} from "@tanstack/query-core"

/**
 * A remote value is **server-owned**: it resolves asynchronously, its authority is `remote` (the
 * server can invalidate/revalidate it), it does not survive a reload on its own (the cache is
 * rebuilt per session), it is never mirrored to other tabs by the backend, never auto-sent to the
 * server, and is not readable at import/SSR without the request-scoped client. These flags are what
 * let the scoped-state surface treat `remote` as one more scope without a name check — and what
 * make the secret guard keep tokens out of it, exactly as for `persistent`/`cookie`/`url`.
 */
export const REMOTE_CAPABILITIES: StateCapabilities = {
  access: "async",
  authority: "remote",
  durable: false,
  sharedAcrossTabs: false,
  sentToServer: false,
  availableAtImport: false,
}

/**
 * Decide whether a cache-notify event for this slot represents a real **data change** worth a
 * re-read. A slot's data changes on a successful write — the `success` action, dispatched by both
 * `setQueryData` and a completed fetch. Every other `updated` event is bookkeeping (a fetch
 * *starting*, an invalidation marking the slot stale, an error, an observer setting state) and must
 * not notify, or the mirror would fire repeatedly with unchanged or stale data. Eviction
 * (`removed`) is a data change too but is handled separately in `subscribe`, guarded by
 * query-object identity; `added` is excluded here because the first `setQueryData` fires `added`
 * *and* `updated/success`, so keying off the latter notifies exactly once per write rather than
 * twice on creation.
 */
function isDataChange(event: QueryCacheNotifyEvent): boolean {
  return event.type === "updated" && event.action.type === "success"
}

/**
 * Build a {@link StateSource} for one slot backed by the TanStack cache at `queryKey`. It
 * **routes** reads/writes/observation into the query cache — it does not reimplement caching,
 * dedup, or invalidation (that stays TanStack's job): `get` reads the cached value, `set` writes
 * it, `remove` evicts the query, and `subscribe` fires only when *this* slot's data changes
 * (matched by the query's stable hash, so unrelated cache activity does not wake the mirror).
 * This is the other half of scope-unified state — remote state reached through the same async
 * `StateSource` seam as memory/persistent/cookie/url.
 */
export function createRemoteSource<Value>(
  client: QueryClient,
  queryKey: QueryKey,
): StateSource<Value> {
  // Derive the hash through the client's *resolved* options for this key — `defaultQueryOptions`
  // merges the global defaults with any per-key `setQueryDefaults`, both of which may supply a
  // `queryKeyHashFn`. A raw `hashKey` (or the global default alone) would mismatch the hash
  // TanStack actually stores under, and this source would never see its own slot's events.
  const hashFn = client.defaultQueryOptions({ queryKey }).queryKeyHashFn ?? hashKey
  const targetHash = hashFn(queryKey)
  return {
    capabilities: REMOTE_CAPABILITIES,
    get: async () => client.getQueryData<Value>(queryKey),
    set: async (value: Value) => {
      client.setQueryData<Value>(queryKey, value)
    },
    remove: async () => {
      client.removeQueries({ queryKey, exact: true })
    },
    subscribe: (onChange) => {
      // A cache subscription alone does not keep the query alive: a value written via
      // `setQueryData` has no observer, so TanStack garbage-collects it `gcTime` after creation
      // even while the scoped-state Provider is mounted — and the `removed` event would reset the
      // mirror. Pin the slot with a disabled observer (never fetches) for the lifetime of this
      // subscription, and release it on unsubscribe so GC resumes. The pin binds to one query
      // *object*: eviction destroys it and a later write builds a new query under the same hash, so
      // the pin is released on `removed` and rebound on the next matching `added` — otherwise the
      // replacement lives unpinned and can be collected mid-subscription. The `removed` guard
      // compares query-object identity, not just the hash: detaching an observer from a destroyed
      // query re-arms its GC timer, and TanStack re-notifies that stale `removed` against whatever
      // now occupies the hash — reacting to it would unpin the live replacement.
      const createPin = () => new QueryObserver(client, { queryKey, enabled: false })
      let pin: ReturnType<typeof createPin> | undefined
      let releasePin: (() => void) | undefined
      const pinCurrent = (): void => {
        releasePin?.()
        pin = createPin()
        releasePin = pin.subscribe(() => {})
      }
      pinCurrent()
      const unsubscribe = client.getQueryCache().subscribe((event) => {
        if (event.query.queryHash !== targetHash) {
          return
        }
        if (event.type === "added") {
          pinCurrent()
          return
        }
        if (event.type === "removed") {
          if (pin !== undefined && event.query === pin.getCurrentQuery()) {
            releasePin?.()
            pin = undefined
            releasePin = undefined
            onChange()
          }
          return
        }
        if (isDataChange(event)) {
          onChange()
        }
      })
      return {
        unsubscribe: () => {
          unsubscribe()
          releasePin?.()
        },
      }
    },
  }
}
