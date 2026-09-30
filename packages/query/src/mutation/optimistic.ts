import type {
  DefaultError,
  MutationFunction,
  MutationOptions,
  MutationScope,
  QueryKey,
} from "@tanstack/query-core"
import { type OptimisticUpdate, optimisticUpdate, writeQueryData } from "../cache/routing"

/** What {@link optimisticMutationOptions} needs: the cached query, the write, and the fold. */
export interface OptimisticMutationConfig<TData, TVariables, TCache> {
  /**
   * The cached query the mutation changes optimistically and re-syncs afterwards. It is also the
   * mutation key, so overlapping writes to it re-sync once, after the last one settles.
   */
  readonly queryKey: QueryKey
  /** The real write. TanStack passes the variables and its function context. */
  readonly mutationFn: MutationFunction<TData, TVariables>
  /**
   * Fold the change into the cached value before the write settles. Runs only when a value is
   * cached; return `undefined` to evict the slot.
   */
  readonly apply: (cache: TCache | undefined, variables: TVariables) => TCache | undefined
  /** Fold the server's result into the cached value once the write succeeds. */
  readonly reconcile?: (
    cache: TCache | undefined,
    data: TData,
    variables: TVariables,
  ) => TCache | undefined
  /** Run mutations that share a scope id one at a time, in call order. */
  readonly scope?: MutationScope
}

/** The `onMutate` result: the rollback handle, or `undefined` when nothing was cached. */
export interface OptimisticMutationContext<TCache> {
  readonly update: OptimisticUpdate<TCache> | undefined
}

/**
 * Options for an optimistic TanStack mutation. Spread them into `useMutation` (or a
 * `MutationObserver`).
 *
 * The lifecycle:
 *
 * 1. Cancel in-flight reads of `queryKey`, so a stale response cannot overwrite the change.
 * 2. Apply the change to the cache, keeping a revision-aware rollback handle.
 * 3. On success, fold the server's result in with `reconcile`, when given.
 * 4. On failure, roll back. When a newer write already replaced the value, the rollback is skipped
 *    and the final invalidation re-syncs the cache instead.
 * 5. Once no other mutation under the same key is pending, invalidate `queryKey`.
 *
 * Provisional ids and entity-specific folds stay with the caller. Surface failures through the
 * mutation's `error` state or per-call callbacks.
 */
export function optimisticMutationOptions<TData, TVariables, TCache, TError = DefaultError>(
  config: OptimisticMutationConfig<TData, TVariables, TCache>,
): MutationOptions<TData, TError, TVariables, OptimisticMutationContext<TCache>> {
  const { queryKey, mutationFn, apply, reconcile, scope } = config
  return {
    mutationKey: queryKey,
    mutationFn,
    ...(scope === undefined ? {} : { scope }),
    onMutate: async (variables, { client }) => {
      await client.cancelQueries({ queryKey })
      if (client.getQueryData<TCache>(queryKey) === undefined) {
        return { update: undefined }
      }
      return {
        update: optimisticUpdate<TCache>({
          client,
          queryKey,
          apply: (cache) => apply(cache, variables),
        }),
      }
    },
    onSuccess: (data, variables, _result, { client }) => {
      if (reconcile !== undefined && client.getQueryData<TCache>(queryKey) !== undefined) {
        writeQueryData<TCache>(client, queryKey, (cache) => reconcile(cache, data, variables))
      }
    },
    onError: (_error, _variables, result) => {
      result?.update?.rollback()
    },
    onSettled: async (_data, _error, _variables, _result, { client }) => {
      // The settling mutation still counts as pending here, so `1` means it is the last write to
      // this exact key. An exact match keeps a write to a parent or child key from hiding it.
      if (client.isMutating({ mutationKey: queryKey, exact: true }) === 1) {
        await client.invalidateQueries({ queryKey })
      }
    },
  }
}
