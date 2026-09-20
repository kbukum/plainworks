// The orders list read through its validation boundary, shared by the SSR prefetch and the client
// query. The mock's decoded `unknown` body is narrowed to the typed `PaginatedResult<Order>` by a
// Standard Schema at the `client.get` seam — the same validation path a real consumer uses — so a
// malformed response fails the read instead of being trusted by an unchecked cast. Neutral and
// server-safe: it names no host global.

import type { Order } from "@plainworks/demo"
import { buildListQuery, type createHttpClient } from "@plainworks/http"
import {
  type ListQueryParams,
  type ListQueryPlan,
  listQueryOptions,
  type PaginatedResult,
} from "@plainworks/query"
import { guardSchema, isPaginatedResult, type WebAbortSignal } from "@plainworks/std"
import { ORDERS_RESOURCE } from "./constants"
import { isOrder } from "./order-shape"

type HttpClient = ReturnType<typeof createHttpClient>

const orderPageSchema = guardSchema<PaginatedResult<Order>>(
  (value): value is PaginatedResult<Order> => isPaginatedResult(value, isOrder),
  "response is not a PaginatedResult<Order>",
)

/**
 * Read one offset page of orders, validated at the boundary; a bodyless response is a read
 * failure.
 */
export async function readOrderPage(
  client: HttpClient,
  params: ListQueryParams,
  signal?: WebAbortSignal,
): Promise<PaginatedResult<Order>> {
  const page = await client.get("/api/orders", {
    query: buildListQuery(params),
    ...(signal ? { signal } : {}),
    schema: orderPageSchema,
  })
  if (page === undefined) {
    throw new Error("GET /api/orders returned no body")
  }
  return page
}

/**
 * The ready-to-spread {@link ListQueryPlan} for the orders list — the deterministic cache key plus
 * a `queryFn` that reads one page through {@link readOrderPage}. The server prefetches it and the
 * client mounts it under the identical key, so the hydrated cache is reused with no refetch flash.
 */
export function orderListPlan(client: HttpClient, params: ListQueryParams): ListQueryPlan<Order> {
  return listQueryOptions<Order>({
    resource: ORDERS_RESOURCE,
    params,
    fetch: (page, signal) => readOrderPage(client, page, signal),
  })
}
