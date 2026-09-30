// Re-export-only barrel for the optimistic-mutation concern: TanStack mutation options that apply a
// change to the cache, roll it back on failure, and re-sync once writes settle.
export type { OptimisticMutationConfig, OptimisticMutationContext } from "./optimistic"
export { optimisticMutationOptions } from "./optimistic"
