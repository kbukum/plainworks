"use client"

import type { Order } from "@plainworks/demo"
import { Badge } from "@plainworks/elements/badge"
import { Label } from "@plainworks/elements/label"
import { NativeSelect, NativeSelectOption } from "@plainworks/elements/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@plainworks/elements/table"
import { DateValue, NumberValue } from "@plainworks/ui/display"
import { Callout } from "@plainworks/ui/feedback"
import { Modal } from "@plainworks/ui/overlays"
import { type ReactElement, useId } from "react"
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from "../../app/constants"
import { Can, canManageOrders } from "../session"
import { ORDER_STATUS_LABEL, ORDER_STATUS_OPTIONS, ORDER_STATUS_TONE } from "./order-fields"

/** Props for {@link OrderDetail}. */
export interface OrderDetailProps {
  /** The order to detail, or `undefined` when nothing is selected (the overlay stays closed). */
  readonly order: Order | undefined
  /** Requested open-state change (close on backdrop, escape, or the close control). */
  readonly onOpenChange: (open: boolean) => void
  /** Advance the order's status — optimistic, authz-gated, rolled back on failure. */
  readonly onChangeStatus: (status: Order["status"]) => void
  /** Whether a status change is in flight — the control is disabled so writes cannot overlap. */
  readonly pending?: boolean
  /** The last status-change failure, shown inside the overlay. */
  readonly error?: unknown
}

const currency = { style: "currency", currency: "USD" } as const

/**
 * The order detail overlay: a labelled {@link Modal} listing the customer, every line item with its
 * quantity, unit price, and subtotal, and the order total — all currency-formatted through the
 * SSR-stable {@link NumberValue}. An authorized operator also gets a status control that advances
 * the order optimistically; a guest sees only the current status badge.
 */
export function OrderDetail({
  order,
  onOpenChange,
  onChangeStatus,
  pending = false,
  error,
}: OrderDetailProps): ReactElement | null {
  const statusId = useId()
  if (order === undefined) {
    return null
  }
  return (
    <Modal
      open
      onOpenChange={onOpenChange}
      title={`Order for ${order.customerName}`}
      description={order.customerEmail}
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <span>Placed</span>
            <DateValue
              value={order.createdAt}
              locale={DISPLAY_LOCALE}
              timeZone={DISPLAY_TIME_ZONE}
            />
          </div>
          <Badge variant={ORDER_STATUS_TONE[order.status]}>
            {ORDER_STATUS_LABEL[order.status]}
          </Badge>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-end">Qty</TableHead>
              <TableHead className="text-end">Unit price</TableHead>
              <TableHead className="text-end">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.items.map((item, index) => (
              <TableRow key={`${item.productId}-${index}`}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-end tabular-nums">{item.quantity}</TableCell>
                <TableCell className="text-end">
                  <NumberValue value={item.price} locale={DISPLAY_LOCALE} options={currency} />
                </TableCell>
                <TableCell className="text-end">
                  <NumberValue
                    value={item.price * item.quantity}
                    locale={DISPLAY_LOCALE}
                    options={currency}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t pt-3">
          <span className="font-medium">Total</span>
          <span className="font-semibold text-lg">
            <NumberValue value={order.total} locale={DISPLAY_LOCALE} options={currency} />
          </span>
        </div>

        {error !== undefined ? (
          <Callout tone="danger" title="That status change could not be saved">
            Check your connection and try again.
          </Callout>
        ) : null}

        <Can authorizer={canManageOrders} action="orders:manage" fallback={null}>
          <div className="grid gap-1.5">
            <Label htmlFor={statusId}>Update status</Label>
            <NativeSelect
              id={statusId}
              className="max-w-xs"
              value={order.status}
              disabled={pending}
              onChange={(event) => onChangeStatus(event.target.value as Order["status"])}
            >
              {ORDER_STATUS_OPTIONS.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </Can>
      </div>
    </Modal>
  )
}
