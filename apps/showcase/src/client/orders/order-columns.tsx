"use client"

import type { Order } from "@plainworks/demo"
import { Badge } from "@plainworks/elements/badge"
import { Button } from "@plainworks/elements/button"
import type { DataTableColumn } from "@plainworks/ui/data-table"
import { DateValue, NumberValue } from "@plainworks/ui/display"
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from "../../app/constants"
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "./order-fields"

/** Options for {@link orderColumns}. */
export interface OrderColumnsOptions {
  /** Open the order's detail overlay. */
  readonly onView: (order: Order) => void
}

/**
 * The orders table columns: customer identity, a currency-formatted total, a toned status badge
 * (the label carries the state, never colour alone), the order date through the SSR-stable
 * {@link DateValue}, and a per-row action that opens the detail overlay. The sortable columns match
 * the backend's sort keys so a header click maps straight to the request.
 */
export function orderColumns({ onView }: OrderColumnsOptions): DataTableColumn<Order>[] {
  return [
    {
      id: "customerName",
      header: "Customer",
      sortable: true,
      cell: (order) => (
        <div className="grid">
          <span className="font-medium">{order.customerName}</span>
          <span className="text-muted-foreground text-xs">{order.customerEmail}</span>
        </div>
      ),
    },
    {
      id: "total",
      header: "Total",
      sortable: true,
      align: "end",
      priority: "low",
      cell: (order) => (
        <NumberValue
          value={order.total}
          locale={DISPLAY_LOCALE}
          options={{ style: "currency", currency: "USD" }}
        />
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      priority: "low",
      cell: (order) => (
        <Badge variant={ORDER_STATUS_TONE[order.status]}>{ORDER_STATUS_LABEL[order.status]}</Badge>
      ),
    },
    {
      id: "createdAt",
      header: "Placed",
      sortable: true,
      priority: "low",
      cell: (order) => (
        <DateValue value={order.createdAt} locale={DISPLAY_LOCALE} timeZone={DISPLAY_TIME_ZONE} />
      ),
    },
    {
      id: "actions",
      header: "Details",
      align: "end",
      cell: (order) => (
        <Button variant="ghost" size="sm" onClick={() => onView(order)}>
          View
          <span className="sr-only"> order for {order.customerName}</span>
        </Button>
      ),
    },
  ]
}
