import type { DescMessage, DescMethodUnary, MessageInitShape } from "@bufbuild/protobuf"
import { createConnectQueryKey } from "@connectrpc/connect-query-core"
import type { CacheInvalidator } from "@plainworks/std/seam"
import type { WebAbortSignal } from "@plainworks/std/web"

/** Options for a {@link MethodInvalidator} call. */
export interface MethodInvalidateOptions<I extends DescMessage> {
  /** Only invalidate queries for this request input. Omit to invalidate every input. */
  readonly input?: MessageInitShape<I>
  /** Aborting cancels the refetches the invalidation started. */
  readonly signal?: WebAbortSignal
}

/** Invalidate every cached query for one unary RPC method, finite and infinite. */
export type MethodInvalidator = <I extends DescMessage, O extends DescMessage>(
  schema: DescMethodUnary<I, O>,
  options?: MethodInvalidateOptions<I>,
) => Promise<void>

/**
 * Bind a {@link CacheInvalidator} to Connect's query keys, for invalidating after a mutation. The
 * key leaves out `cardinality`, so it partially matches **both** the finite and the infinite
 * queries for the method. There is no exact option: a real entry always carries a cardinality, so
 * an exact match could never hit.
 *
 * Pass `createCacheInvalidator(queryClient)` from `@plainworks/query/cache`. `connect` depends only
 * on the seam, so it never imports `query`.
 */
export function createMethodInvalidator(cache: CacheInvalidator): MethodInvalidator {
  return (schema, options = {}) => {
    const key = createConnectQueryKey({
      schema,
      cardinality: undefined,
      ...(options.input !== undefined ? { input: options.input } : {}),
    })
    return cache.invalidate(
      { key },
      options.signal !== undefined ? { signal: options.signal } : undefined,
    )
  }
}
