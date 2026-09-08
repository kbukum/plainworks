import {
  type DehydratedState,
  type DehydrateOptions,
  dehydrate,
  hydrate,
  type InfiniteQueryExecuteOptions,
  type QueryClient,
  type QueryExecuteOptions,
} from "@tanstack/query-core"

/**
 * The outcome of a best-effort prefetch. `warmed` means the query resolved and its data is in the
 * cache (so `dehydrateClient` will ship it); `failed` carries the rejection `cause` so the caller can
 * log or report it — the error is preserved, never swallowed into a bare boolean.
 */
export type PrefetchOutcome =
  | { readonly status: "warmed" }
  | { readonly status: "failed"; readonly cause: unknown }

/**
 * Prefetch a query into `client` on the server so its data is warm before render — the first half of
 * the RSC prefetch → dehydrate → hydrate flow. Built on TanStack's `client.query` (the non-deprecated
 * successor to `prefetchQuery`), which *rejects* on a fetch error; this wrapper turns that rejection
 * into a `failed` {@link PrefetchOutcome} carrying the cause, so a warming failure never aborts the
 * server render yet is never silently discarded. TanStack's default dehydration serializes only
 * **successful** queries, so a failed prefetch is not shipped to the browser: the client mounts the
 * query cold and fetches it fresh, where its own error boundary handles a repeat failure. A server
 * component can therefore `await` a batch of prefetches, inspect the outcomes (e.g. to log failures),
 * and {@link dehydrateClient} the lot without any one failure taking down the tree.
 */
export async function prefetchQuery<T>(
  client: QueryClient,
  options: QueryExecuteOptions<T>,
): Promise<PrefetchOutcome> {
  try {
    await client.query(options)
    return { status: "warmed" }
  } catch (cause) {
    return { status: "failed", cause }
  }
}

/** Prefetch an infinite (cursor/page) query into `client` on the server — the infinite analogue of {@link prefetchQuery}, with the same best-effort {@link PrefetchOutcome}. */
export async function prefetchInfiniteQuery<T>(
  client: QueryClient,
  options: InfiniteQueryExecuteOptions<T>,
): Promise<PrefetchOutcome> {
  try {
    await client.infiniteQuery(options)
    return { status: "warmed" }
  } catch (cause) {
    return { status: "failed", cause }
  }
}

/**
 * Dehydration policy for {@link dehydrateClient}. Everything dehydrated crosses the server→client
 * trust boundary into the browser payload, so the query policy is **required**: there is no
 * "ship whatever succeeded" default to forget to tighten. Pass an allowlist
 * (`shouldDehydrateQuery: (query) => allowlist.has(query.queryKey[0])`) when any warmed query is not
 * public, or an explicit `() => true` when every query on this client is safe to ship. Mutations are
 * never dehydrated by this helper unless `shouldDehydrateMutation` is supplied explicitly (TanStack's
 * own default ships *paused* mutations, which a server render has no business replaying).
 */
export type DehydrateClientOptions = Omit<DehydrateOptions, "shouldDehydrateQuery"> & {
  /** Explicit decision for every cached query — ship it to the browser or keep it server-only. */
  readonly shouldDehydrateQuery: NonNullable<DehydrateOptions["shouldDehydrateQuery"]>
}

/**
 * Snapshot a server `client`'s cache into a serializable {@link DehydratedState} to ship to the browser
 * — the second half of the flow. Pass the result to the client `HydrationBoundary` (from `./client`),
 * which rehydrates it into the browser client so the first client render reuses the server's data with
 * no loading flash. Hydration does not imply *no refetch*: with the default `staleTime: 0` a hydrated
 * query is immediately stale and refetches in the background on mount — freshness follows the client's
 * configured stale/refetch policy.
 *
 * The query policy is mandatory (see {@link DehydrateClientOptions}); TanStack's
 * {@link DehydrateOptions} also lets the policy transform non-serializable data before it ships.
 */
export function dehydrateClient(
  client: QueryClient,
  options: DehydrateClientOptions,
): DehydratedState {
  return dehydrate(client, { shouldDehydrateMutation: () => false, ...options })
}

/**
 * Rehydrate a {@link DehydratedState} into `client` imperatively — the non-React path (a worker, a test,
 * or a host wiring hydration by hand). Inside a React tree, prefer the `HydrationBoundary` component
 * from `./client`, which calls this for you and re-runs it as streamed server data arrives.
 */
export function hydrateClient(client: QueryClient, state: DehydratedState): void {
  hydrate(client, state)
}
