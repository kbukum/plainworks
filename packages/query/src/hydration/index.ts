// Re-export-only barrel for the RSC hydration concern: server-side prefetch + dehydrate, and the
// imperative hydrate. The React `HydrationBoundary` component lives in the `./client` entry. No logic here.
export type { DehydratedState } from "@tanstack/query-core"
export type { DehydrateClientOptions, PrefetchOutcome } from "./prefetch"
export {
  dehydrateClient,
  hydrateClient,
  prefetchInfiniteQuery,
  prefetchQuery,
} from "./prefetch"
