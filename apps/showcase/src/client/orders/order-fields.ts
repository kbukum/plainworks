import type { Order } from "@plainworks/demo"
import { ORDER_STATUSES } from "../../app/order-shape"
import type { FacetOption } from "../catalog"

type BadgeTone = "default" | "secondary" | "destructive" | "outline"

/** Human-readable label for each order status. */
export const ORDER_STATUS_LABEL: Record<Order["status"], string> = {
  pending: "Pending",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
}

/** Badge tone per status — delivered reads as solid, cancelled as an error, the rest as quieter. */
export const ORDER_STATUS_TONE: Record<Order["status"], BadgeTone> = {
  pending: "outline",
  processing: "secondary",
  shipped: "secondary",
  delivered: "default",
  cancelled: "destructive",
}

/**
 * Status facet options — the same vocabulary, for the shared {@link FacetPanel} and the status
 * select.
 */
export const ORDER_STATUS_OPTIONS: readonly FacetOption[] = ORDER_STATUSES.map((status) => ({
  value: status,
  label: ORDER_STATUS_LABEL[status],
}))
