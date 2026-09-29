// Prelude for `@plainworks/query`: the per-request TanStack `QueryClient` factory every module
// builds on. Each other concern is its own subpath: `./cache`, `./hydration`, `./list`, `./remote`,
// and the React provider under `./client`. Re-export-only barrel; no React or DOM imports.
export {
  createQueryClient,
  DEFAULT_QUERY_STALE_TIME_MS,
  type QueryClient,
  type QueryClientConfig,
} from "./query-client"
