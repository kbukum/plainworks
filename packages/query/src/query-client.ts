import {
  type QueryClient,
  type QueryClientConfig,
  QueryClient as QueryClientCtor,
} from "@tanstack/query-core"

/**
 * The TanStack cache the kit builds, re-exported so consumers type a client they hold without
 * reaching past the kit into `@tanstack/query-core` — and without the `ReturnType<typeof
 * createQueryClient>` alias every host would otherwise reinvent.
 */
export type { QueryClient, QueryClientConfig }

/**
 * How long a query stays fresh unless the caller says otherwise: one minute. A server-rendered
 * page hydrates its data into the browser; with TanStack's own default of `0` that data is stale
 * the moment it lands and every query refetches on mount, which also lets lazily hydrated
 * boundaries render newer data than the server sent. A short positive default avoids both.
 */
export const DEFAULT_QUERY_STALE_TIME_MS = 60_000

/**
 * Build a fresh {@link QueryClient} — the kit's one factory for a TanStack cache. It is a thin,
 * typed wrapper over the `@tanstack/query-core` constructor with **no import-time side effects and
 * no shared instance**: every call returns a new client. That is the SSR/RSC-safe contract — the
 * server builds one client per request (never a module-level singleton that would leak one user's
 * cache into another), while the browser builds one at startup and reuses it for the app's
 * lifetime. The host owns that lifetime: `QueryProvider` only forwards the client it is given and
 * never creates or retains one.
 *
 * Queries default to {@link DEFAULT_QUERY_STALE_TIME_MS} of freshness so hydration does not
 * trigger an immediate refetch. Pass `config` to set kit-wide defaults; any query default you
 * supply, `staleTime` included, wins over the kit's.
 */
export function createQueryClient(config: QueryClientConfig = {}): QueryClient {
  const { defaultOptions, ...rest } = config
  return new QueryClientCtor({
    ...rest,
    defaultOptions: {
      ...defaultOptions,
      queries: { staleTime: DEFAULT_QUERY_STALE_TIME_MS, ...defaultOptions?.queries },
    },
  })
}
