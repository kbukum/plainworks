import type { Product } from "@plainworks/demo"
import type { FacetOption } from "../catalog"

type BadgeTone = "default" | "secondary" | "destructive" | "outline"

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

/** Badge tone per status — available reads as solid, out-of-stock as an error, the rest quieter. */
export const PRODUCT_STATUS_TONE: Record<Product["status"], BadgeTone> = {
  available: "default",
  out_of_stock: "destructive",
  discontinued: "outline",
  active: "default",
  draft: "secondary",
  archived: "outline",
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
