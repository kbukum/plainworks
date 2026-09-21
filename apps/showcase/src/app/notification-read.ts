// The notifications feed read through its validation boundary, shared by the SSR prefetch and the
// client query. The mock's decoded `unknown` body is narrowed to the typed `PaginatedResult` by a
// Standard Schema at the `client.get` seam — the same validation path a real consumer uses — so a
// malformed response fails the read instead of being trusted by an unchecked cast. Neutral and
// server-safe: it names no host global.

import type { Notification } from "@plainworks/demo"
import { buildListQuery, type createHttpClient } from "@plainworks/http"
import {
  type ListQueryParams,
  type ListQueryPlan,
  listQueryOptions,
  type PaginatedResult,
} from "@plainworks/query"
import { guardSchema, isPaginatedResult, type WebAbortSignal } from "@plainworks/std"
import { NOTIFICATIONS_RESOURCE } from "./constants"
import { isNotification } from "./notification-shape"

type HttpClient = ReturnType<typeof createHttpClient>

const notificationPageSchema = guardSchema<PaginatedResult<Notification>>(
  (value): value is PaginatedResult<Notification> => isPaginatedResult(value, isNotification),
  "response is not a PaginatedResult<Notification>",
)

/**
 * Read one page of notifications, validated at the boundary; a bodyless response is a read failure.
 */
export async function readNotificationPage(
  client: HttpClient,
  params: ListQueryParams,
  signal?: WebAbortSignal,
): Promise<PaginatedResult<Notification>> {
  const page = await client.get("/api/notifications", {
    query: buildListQuery(params),
    ...(signal ? { signal } : {}),
    schema: notificationPageSchema,
  })
  if (page === undefined) {
    throw new Error("GET /api/notifications returned no body")
  }
  return page
}

/**
 * The ready-to-spread {@link ListQueryPlan} for the notifications feed — the deterministic cache
 * key plus a `queryFn` that reads one page through {@link readNotificationPage}. The server
 * prefetches it and the client (the feed and the shell's unread badge alike) mounts it under the
 * identical key, so one hydrated cache is reused without a loading flash or a second source of
 * truth.
 */
export function notificationListPlan(
  client: HttpClient,
  params: ListQueryParams,
): ListQueryPlan<Notification> {
  return listQueryOptions<Notification>({
    resource: NOTIFICATIONS_RESOURCE,
    params,
    fetch: (page, signal) => readNotificationPage(client, page, signal),
  })
}
