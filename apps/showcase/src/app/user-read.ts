// The users directory read through its validation boundary, shared by the SSR prefetch and the
// client query. The mock's decoded `unknown` body is narrowed to the typed `PaginatedResult<User>`
// by a Standard Schema at the `client.get` seam — the same validation path a real consumer uses —
// so a malformed response fails the read instead of being trusted by an unchecked cast. Neutral and
// server-safe: it names no host global.

import type { User } from "@plainworks/demo"
import { buildListQuery, type createHttpClient } from "@plainworks/http"
import {
  type ListQueryParams,
  type ListQueryPlan,
  listQueryOptions,
  type PaginatedResult,
} from "@plainworks/query"
import { guardSchema, isPaginatedResult, type WebAbortSignal } from "@plainworks/std"
import { USERS_RESOURCE } from "./constants"
import { isUser } from "./user-shape"

type HttpClient = ReturnType<typeof createHttpClient>

const userPageSchema = guardSchema<PaginatedResult<User>>(
  (value): value is PaginatedResult<User> => isPaginatedResult(value, isUser),
  "response is not a PaginatedResult<User>",
)

/**
 * Read one offset page of users, validated at the boundary; a bodyless response is a read failure.
 */
export async function readUserPage(
  client: HttpClient,
  params: ListQueryParams,
  signal?: WebAbortSignal,
): Promise<PaginatedResult<User>> {
  const page = await client.get("/api/users", {
    query: buildListQuery(params),
    ...(signal ? { signal } : {}),
    schema: userPageSchema,
  })
  if (page === undefined) {
    throw new Error("GET /api/users returned no body")
  }
  return page
}

/**
 * The ready-to-spread {@link ListQueryPlan} for the team directory — the deterministic cache key
 * plus a `queryFn` that reads one page through {@link readUserPage}. The server prefetches it and
 * the client mounts it under the identical key, so the hydrated cache is reused with no refetch
 * flash.
 */
export function userListPlan(client: HttpClient, params: ListQueryParams): ListQueryPlan<User> {
  return listQueryOptions<User>({
    resource: USERS_RESOURCE,
    params,
    fetch: (page, signal) => readUserPage(client, page, signal),
  })
}
