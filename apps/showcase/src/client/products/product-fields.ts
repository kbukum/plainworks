import type { Product } from "@plainworks/demo"
import type { StatusTone } from "@plainworks/ui/display/status-badge"
import type { FacetOption } from "../catalog"

const CATALOG_PRODUCT_STATUSES = [
  "available",
  "out_of_stock",
  "discontinued",
] as const satisfies readonly Product["status"][]

/** The product categories the demo backend generates, in display order. */
export const PRODUCT_CATEGORIES: readonly string[] = [
  "Electronics",
  "Accessories",
  "Office",
  "Audio",
  "Gaming",
]

/** Human-readable label for each product status. */
export const PRODUCT_STATUS_LABEL: Record<Product["status"], string> = {
  available: "Available",
  out_of_stock: "Out of stock",
  discontinued: "Discontinued",
  active: "Active",
  draft: "Draft",
  archived: "Archived",
}

/** Status tone per product status: sellable is a success, out of stock needs attention. */
export const PRODUCT_STATUS_TONE: Record<Product["status"], StatusTone> = {
  available: "success",
  out_of_stock: "warning",
  discontinued: "neutral",
  active: "success",
  draft: "info",
  archived: "neutral",
}

/** Category facet options for the shared {@link FacetPanel}. */
export const PRODUCT_CATEGORY_OPTIONS: readonly FacetOption[] = PRODUCT_CATEGORIES.map(
  (category) => ({ value: category, label: category }),
)

/** Status facet options for the shared {@link FacetPanel}. */
export const PRODUCT_STATUS_OPTIONS: readonly FacetOption[] = CATALOG_PRODUCT_STATUSES.map(
  (status) => ({
    value: status,
    label: PRODUCT_STATUS_LABEL[status],
  }),
)

/** Whether a product can be ordered — availability plus stock on hand. */
export function productInStock(product: Product): boolean {
  return product.status === "available" && product.stock > 0
}
