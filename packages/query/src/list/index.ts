// Re-export-only barrel for the list-query cache concern (the L2 half of the PostgREST list contract):
// deterministic offset/infinite cache keys and thin option builders over TanStack. The wire builder and
// envelope types live in `@plainworks/http` (the L1 half). No logic here.
export type { InfiniteListKeyOptions, ListKeyOptions } from "./cache-key"
export { infiniteListQueryKey, listQueryKey } from "./cache-key"
export type {
  InfiniteListQueryOptionsInput,
  InfiniteListQueryPlan,
  ListQueryOptionsInput,
  ListQueryPlan,
} from "./options"
export { infiniteListQueryOptions, listQueryOptions } from "./options"
