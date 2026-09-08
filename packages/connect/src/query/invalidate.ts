import type { DescMessage, DescMethodUnary, MessageInitShape } from "@bufbuild/protobuf"
import { createConnectQueryKey } from "@connectrpc/connect-query-core"
import type { QueryClient } from "@tanstack/query-core"

/** Options for the method-scoped invalidator returned by {@link createInvalidator}. */
export interface InvalidateOptions<I extends DescMessage> {
  /**
   * Restrict invalidation to a specific request input. Omit to invalidate every cached query for
   * the method regardless of input.
   */
  readonly input?: MessageInitShape<I>
}

/**
 * Bind a `QueryClient` to a method-scoped invalidation helper — the kit's invalidation convention
 * for mutations. The key is built with `cardinality: undefined` so it matches **both** finite and
 * infinite queries for the method (connect-query omits the field, yielding a prefix key).
 * Matching is always a **prefix** match: an exact-match option is deliberately absent because this
 * helper never builds a full cache key (a real entry carries `"finite"`/`"infinite"` cardinality,
 * which an exact filter here could never satisfy), so it would silently match nothing.
 *
 * React-free: it takes any `@tanstack/query-core` `QueryClient` (the server-safe core of TanStack
 * Query), so it works in an RSC/server action as well as the browser.
 */
export function createInvalidator(queryClient: QueryClient) {
  return function invalidate<I extends DescMessage, O extends DescMessage>(
    schema: DescMethodUnary<I, O>,
    options: InvalidateOptions<I> = {},
  ): Promise<void> {
    const queryKey = createConnectQueryKey({
      schema,
      cardinality: undefined,
      ...(options.input !== undefined ? { input: options.input } : {}),
    })
    return queryClient.invalidateQueries({ queryKey })
  }
}
