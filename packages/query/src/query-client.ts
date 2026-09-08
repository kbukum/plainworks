import {
  type QueryClient,
  type QueryClientConfig,
  QueryClient as QueryClientCtor,
} from "@tanstack/query-core"

/**
 * Build a fresh {@link QueryClient} — the kit's one factory for a TanStack cache. It is a thin,
 * typed wrapper over the `@tanstack/query-core` constructor with **no import-time side effects and
 * no shared instance**: every call returns a new client. That is the SSR/RSC-safe contract — the
 * server builds one client per request (never a module-level singleton that would leak one user's
 * cache into another), while the browser builds one at startup and reuses it for the app's
 * lifetime. The host owns that lifetime: `QueryProvider` only forwards the client it is given and
 * never creates or retains one. Pass `config` to set kit-wide query/mutation defaults in one place.
 */
export function createQueryClient(config?: QueryClientConfig): QueryClient {
  return new QueryClientCtor(config)
}
