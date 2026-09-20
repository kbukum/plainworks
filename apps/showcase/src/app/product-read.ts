// The products list read through its validation boundary, shared by the SSR prefetch and the client
// query. The mock's decoded `unknown` body is narrowed to the typed `PaginatedResult<Product>` by a
// Standard Schema at the `client.get` seam — the same validation path a real consumer uses — so a
// malformed response fails the read instead of being trusted by an unchecked cast. Neutral and
// server-safe: it names no host global.

import type { Product } from "@plainworks/demo"
import { buildListQuery, type createHttpClient } from "@plainworks/http"
import {
  type ListQueryParams,
  type ListQueryPlan,
  listQueryOptions,
  type PaginatedResult,
} from "@plainworks/query"
import { guardSchema, isPaginatedResult, type WebAbortSignal } from "@plainworks/std"
import { PRODUCTS_RESOURCE } from "./constants"
import { isProduct } from "./product-shape"

type HttpClient = ReturnType<typeof createHttpClient>

const productPageSchema = guardSchema<PaginatedResult<Product>>(
  (value): value is PaginatedResult<Product> => isPaginatedResult(value, isProduct),
  "response is not a PaginatedResult<Product>",
)

/**
 * Read one offset page of products, validated at the boundary; a bodyless response is a read
 * failure.
 */
export async function readProductPage(
  client: HttpClient,
  params: ListQueryParams,
  signal?: WebAbortSignal,
): Promise<PaginatedResult<Product>> {
  const page = await client.get("/api/products", {
    query: buildListQuery(params),
    ...(signal ? { signal } : {}),
    schema: productPageSchema,
  })
  if (page === undefined) {
    throw new Error("GET /api/products returned no body")
  }
  return page
}

/**
 * The ready-to-spread {@link ListQueryPlan} for the product catalog — the deterministic cache key
 * plus a `queryFn` that reads one page through {@link readProductPage}. The server prefetches it
 * and the client mounts it under the identical key, so the hydrated cache is reused with no refetch
 * flash.
 */
export function productListPlan(
  client: HttpClient,
  params: ListQueryParams,
): ListQueryPlan<Product> {
  return listQueryOptions<Product>({
    resource: PRODUCTS_RESOURCE,
    params,
    fetch: (page, signal) => readProductPage(client, page, signal),
  })
}
