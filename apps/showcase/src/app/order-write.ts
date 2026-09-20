// The order status write through its validation boundary. A status change PATCHes the order and the
// mock echoes the persisted row, decoded from `unknown` and narrowed by the same {@link isOrder}
// guard the list read uses — so an optimistic cache update reconciles against a trusted shape, not
// a fabricated one. Neutral and server-safe: it names no host global and the write is cancellable.

import type { Order } from "@plainworks/demo"
import type { createHttpClient } from "@plainworks/http"
import { guardSchema, isRecord, type WebAbortSignal } from "@plainworks/std"
import { isOrder } from "./order-shape"

type HttpClient = ReturnType<typeof createHttpClient>

const orderEnvelopeSchema = guardSchema<{ readonly data: Order }>(
  (value): value is { readonly data: Order } => isRecord(value) && isOrder(value.data),
  "response is not a { data: Order } envelope",
)

function encodeOrderId(id: string): string {
  const trimmed = id.trim()
  if (
    trimmed === "" ||
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  ) {
    throw new Error(`Invalid order id: "${id}"`)
  }
  return encodeURIComponent(trimmed)
}

/**
 * Advance an order's status, returning the persisted row validated at the boundary; a bodyless
 * response fails. Only the status is written — the mock recomputes nothing else — so the optimistic
 * update reconciles against exactly one changed field.
 */
export async function updateOrderStatus(
  client: HttpClient,
  id: string,
  status: Order["status"],
  signal?: WebAbortSignal,
): Promise<Order> {
  const segment = encodeOrderId(id)
  const updated = await client.patch(`/api/orders/${segment}`, {
    body: { status },
    ...(signal ? { signal } : {}),
    schema: orderEnvelopeSchema,
  })
  if (updated === undefined) {
    throw new Error(`PATCH /api/orders/${segment} returned no body`)
  }
  return updated.data
}
