// The `Product` runtime shape in one server-safe place — the status vocabulary and a sound type
// guard the product list read narrows through, so a malformed row can never cross as a typed
// `Product`. Neutral: it names no host global.

import type { Product } from "@plainworks/demo"
import { isAbsentOr, isNonEmptyString, isOneOf, isRecord } from "@plainworks/std"

/** Every product status the demo backend emits, availability first. */
export const PRODUCT_STATUSES: readonly Product["status"][] = [
  "available",
  "out_of_stock",
  "discontinued",
  "active",
  "draft",
  "archived",
]

/**
 * A sound {@link Product} guard: required identity, price, category, and stock present, a status
 * drawn from {@link PRODUCT_STATUSES}, and every optional field type-checked when present.
 */
export function isProduct(value: unknown): value is Product {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    typeof value.price === "number" &&
    isNonEmptyString(value.category) &&
    typeof value.stock === "number" &&
    isOneOf(value.status, PRODUCT_STATUSES) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    isAbsentOr(value.description, (v) => typeof v === "string") &&
    isAbsentOr(value.image, (v) => typeof v === "string")
  )
}
