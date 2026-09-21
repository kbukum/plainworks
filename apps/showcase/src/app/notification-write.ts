// The notification act-on writes through their validation boundary: mark a row read, dismiss a row,
// and mark every row read in one request. Each response is decoded from `unknown` and narrowed —
// the marked row by the same {@link isNotification} guard the feed read uses, the dismiss and bulk
// envelopes by their own guards — so an optimistic cache update reconciles against a trusted shape,
// not a fabricated one. Neutral and server-safe: it names no host global and every write is
// cancellable.

import type { Notification } from "@plainworks/demo"
import type { createHttpClient } from "@plainworks/http"
import { guardSchema, isRecord, type WebAbortSignal } from "@plainworks/std"
import { NOTIFICATION_MUTATION_HEADER, NOTIFICATION_MUTATION_HEADER_VALUE } from "./constants"
import { encodeIdSegment } from "./id-segment"
import { isNotification } from "./notification-shape"

type HttpClient = ReturnType<typeof createHttpClient>

const notificationEnvelopeSchema = guardSchema<{ readonly data: Notification }>(
  (value): value is { readonly data: Notification } =>
    isRecord(value) && isNotification(value.data),
  "response is not a { data: Notification } envelope",
)

const dismissEnvelopeSchema = guardSchema<{ readonly data: { readonly success: true } }>(
  (value): value is { readonly data: { readonly success: true } } =>
    isRecord(value) && isRecord(value.data) && value.data.success === true,
  "response is not a successful dismissal envelope",
)

const markAllEnvelopeSchema = guardSchema<{ readonly data: { readonly updated: number } }>(
  (value): value is { readonly data: { readonly updated: number } } =>
    isRecord(value) &&
    isRecord(value.data) &&
    typeof value.data.updated === "number" &&
    Number.isSafeInteger(value.data.updated) &&
    value.data.updated >= 0,
  "response is not a { data: { updated: number } } envelope",
)

/**
 * Mark one notification read, returning the persisted row validated at the boundary; a bodyless
 * response fails. Only the read flag is written, so the optimistic update reconciles against
 * exactly one changed field.
 */
export async function markNotificationRead(
  client: HttpClient,
  id: string,
  signal?: WebAbortSignal,
): Promise<Notification> {
  const segment = encodeIdSegment("notification", id)
  const updated = await client.patch(`/api/notifications/${segment}`, {
    body: { read: true },
    headers: { [NOTIFICATION_MUTATION_HEADER]: NOTIFICATION_MUTATION_HEADER_VALUE },
    ...(signal ? { signal } : {}),
    schema: notificationEnvelopeSchema,
  })
  if (updated === undefined) {
    throw new Error(`PATCH /api/notifications/${segment} returned no body`)
  }
  return updated.data
}

/**
 * Dismiss one notification, removing it from the backend. Resolves once the delete is acknowledged;
 * a bodyless response fails.
 */
export async function dismissNotification(
  client: HttpClient,
  id: string,
  signal?: WebAbortSignal,
): Promise<void> {
  const segment = encodeIdSegment("notification", id)
  const result = await client.delete(`/api/notifications/${segment}`, {
    headers: { [NOTIFICATION_MUTATION_HEADER]: NOTIFICATION_MUTATION_HEADER_VALUE },
    ...(signal ? { signal } : {}),
    schema: dismissEnvelopeSchema,
  })
  if (result === undefined) {
    throw new Error(`DELETE /api/notifications/${segment} returned no body`)
  }
}

/**
 * Mark every notification read in one request, returning the count the backend flipped; a bodyless
 * response fails. The one round-trip a real inbox's "mark all read" makes, gated at the server.
 */
export async function markAllNotificationsRead(
  client: HttpClient,
  signal?: WebAbortSignal,
): Promise<number> {
  const result = await client.post("/api/notifications/read-all", {
    headers: { [NOTIFICATION_MUTATION_HEADER]: NOTIFICATION_MUTATION_HEADER_VALUE },
    ...(signal ? { signal } : {}),
    schema: markAllEnvelopeSchema,
  })
  if (result === undefined) {
    throw new Error("POST /api/notifications/read-all returned no body")
  }
  return result.data.updated
}
