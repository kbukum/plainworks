import type { Scope, SourceSpec } from "@plainworks/state"
import type { StateSource } from "@plainworks/std"
import type { QueryClient, QueryKey } from "@tanstack/query-core"
import { createRemoteSource, REMOTE_CAPABILITIES } from "./source"

/** Options for {@link createRemoteScope}. */
export interface RemoteScopeOptions {
  /**
   * The request-scoped {@link QueryClient} the remote slots route through. Injected per request
   * (never a module-level singleton), so two concurrent SSR requests never share a cache — the same
   * composition rule the rest of the kit follows.
   */
  readonly client: QueryClient
  /**
   * Prefix prepended to every slot's key, namespacing scoped-state slots inside the shared cache so
   * they never collide with a transport's own query keys. Defaults to `["plainworks", "remote"]`.
   */
  readonly keyPrefix?: QueryKey
}

/**
 * Build the **remote** {@link Scope} — a `StateSource` factory backed by the TanStack cache — so
 * `createScopedState({ scope: createRemoteScope({ client }), key, initial })`
 * reads/writes/subscribes a server-owned value through the **same** scoped-state surface as
 * `memory`/`persistent`/`cookie`/`url`, with **no change** to the `Scope`/`StateSource` seams.
 * The seam was designed general (local + remote, sync + async) up front, so `remote` is one more
 * scope, not a widening.
 *
 * `query` (L2) implements the `Scope` seam that `state` (L1) defines — the sanctioned "higher layer
 * implements the lower layer's seam" direction — and the client is injected at composition (`app`),
 * so `state` never depends on `query` and the L1→L2 direction is never inverted. A remote slot
 * holds a live typed reference in the cache, so (like `memory`) it ignores the spec's serializer.
 */
export function createRemoteScope(options: RemoteScopeOptions): Scope {
  const prefix = options.keyPrefix ?? ["plainworks", "remote"]
  return {
    name: "remote",
    capabilities: REMOTE_CAPABILITIES,
    createSource<Value>(spec: SourceSpec<Value>): StateSource<Value> {
      return createRemoteSource<Value>(options.client, [...prefix, spec.key])
    },
  }
}
