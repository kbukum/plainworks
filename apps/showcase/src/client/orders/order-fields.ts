import type { Order } from "@plainworks/demo"
import type { FacetOption } from "@plainworks/ui/data/facet-panel"
import type { StatusTone } from "@plainworks/ui/display/status-badge"
import { ORDER_STATUSES } from "../../app/order-shape"

/** Human-readable label for each order status. */
export const ORDER_STATUS_LABEL: Record<Order["status"], string> = {
  pending: "Pending",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
}

/** Status tone per order status: delivered is a success, cancelled a problem, the rest underway. */
export const ORDER_STATUS_TONE: Record<Order["status"], StatusTone> = {
  pending: "neutral",
  processing: "info",
  shipped: "info",
  delivered: "success",
  cancelled: "danger",
}

/**
 * Status facet options — the same vocabulary, for the kit `FacetPanel` and the status
 * select.
 */
export const ORDER_STATUS_OPTIONS: readonly FacetOption[] = ORDER_STATUSES.map((status) => ({
  value: status,
  label: ORDER_STATUS_LABEL[status],
}))
