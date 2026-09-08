import type { StateCapabilities, StateSource } from "@plainworks/std"
import { createStore } from "../store"
import type { Scope } from "./scope"

/**
 * In-memory state lives only for the life of its owning store: not durable, not shared across tabs,
 * never sent to the server, and available immediately (no host needed), so it is the one scope safe
 * to read during SSR.
 */
const MEMORY_CAPABILITIES: StateCapabilities = {
  access: "sync",
  authority: "local",
  durable: false,
  sharedAcrossTabs: false,
  sentToServer: false,
  availableAtImport: true,
}

/**
 * Build an in-memory {@link StateSource} for one value slot. It is backed by the kit's owned
 * {@link createStore} — the same store model the React binding drives — so `memory` is genuinely
 * one more scope over the existing store, not a parallel state API bolted alongside it. The store
 * starts empty (`undefined`); `set` replaces the whole value (works for a primitive or an object),
 * `remove` clears it, and `subscribe` is the store's own subscription.
 */
function createMemorySource<Value>(): StateSource<Value> {
  const store = createStore<Value | undefined>(() => undefined)
  return {
    capabilities: MEMORY_CAPABILITIES,
    get: async () => store.getState(),
    set: async (value) => {
      store.setState(value, true)
    },
    remove: async () => {
      store.setState(undefined, true)
    },
    subscribe: (onChange) => {
      const unsubscribe = store.subscribe(() => onChange())
      return { unsubscribe }
    },
  }
}

/**
 * The **memory** scope: transient client state that is gone on reload. Server-safe (no host), so a
 * value declared in this scope is the one that can hydrate straight from an SSR snapshot.
 * Use it for ephemeral UI state; reach for `persistent`/`session` when the value must outlive the
 * page.
 */
export const memoryScope: Scope = {
  name: "memory",
  capabilities: MEMORY_CAPABILITIES,
  createSource: () => createMemorySource(),
}
