// The `Order` runtime shape in one server-safe place — the status vocabulary and a sound type guard
// the order list read and the status write both narrow through, so a malformed row can never cross
// as a typed `Order`. Neutral: it names no host global.

import type { Order, OrderItem } from "@plainworks/demo"
import { isNonEmptyString, isOneOf, isRecord } from "@plainworks/std"

/** Every order status, in fulfilment order. */
export const ORDER_STATUSES: readonly Order["status"][] = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
]

function isOrderItem(value: unknown): value is OrderItem {
  return (
    isRecord(value) &&
    isNonEmptyString(value.productId) &&
    typeof value.name === "string" &&
    typeof value.quantity === "number" &&
    typeof value.price === "number"
  )
}

/**
 * A sound {@link Order} guard: required identity and customer fields present, a status drawn from
 * {@link ORDER_STATUSES}, a numeric total, and a line-item array whose every entry type-checks.
 */
export function isOrder(value: unknown): value is Order {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.customerId) &&
    typeof value.customerName === "string" &&
    typeof value.customerEmail === "string" &&
    isOneOf(value.status, ORDER_STATUSES) &&
    typeof value.total === "number" &&
    Array.isArray(value.items) &&
    value.items.every(isOrderItem) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  )
}
