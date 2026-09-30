"use client"

import type { Product } from "@plainworks/demo"
import { Badge } from "@plainworks/elements/badge"
import { DescriptionItem, DescriptionList } from "@plainworks/ui/display/description-list"
import { NumberValue } from "@plainworks/ui/display/number-value"
import { StatusBadge } from "@plainworks/ui/display/status-badge"
import { Modal } from "@plainworks/ui/overlays/modal"
import type { ReactElement } from "react"
import { DISPLAY_LOCALE } from "../../app/constants"
import { PRODUCT_STATUS_LABEL, PRODUCT_STATUS_TONE, productInStock } from "./product-fields"

const currency = { style: "currency", currency: "USD" } as const

/** Props for {@link ProductDetail}. */
export interface ProductDetailProps {
  /** The product to detail, or `undefined` when nothing is selected (the overlay stays closed). */
  readonly product: Product | undefined
  /** Requested open-state change (close on backdrop, escape, or the close control). */
  readonly onOpenChange: (open: boolean) => void
}

/** One labelled detail field rendered as a description-list pair. */
/**
 * The product detail overlay: a labelled {@link Modal} leading with category and status badges and
 * the currency-formatted price, then the full description and a description list of category,
 * availability, and stock on hand.
 */
export function ProductDetail({ product, onOpenChange }: ProductDetailProps): ReactElement | null {
  if (product === undefined) {
    return null
  }
  const inStock = productInStock(product)
  return (
    <Modal open onOpenChange={onOpenChange} title={product.name}>
      <div className="@container grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{product.category}</Badge>
            <StatusBadge tone={PRODUCT_STATUS_TONE[product.status]}>
              {PRODUCT_STATUS_LABEL[product.status]}
            </StatusBadge>
          </div>
          <span className="font-semibold text-xl">
            <NumberValue value={product.price} locale={DISPLAY_LOCALE} options={currency} />
          </span>
        </div>

        {product.description === undefined ? null : (
          <p className="text-muted-foreground text-sm">{product.description}</p>
        )}

        <DescriptionList>
          <DescriptionItem term="Category">{product.category}</DescriptionItem>
          <DescriptionItem term="Status">{PRODUCT_STATUS_LABEL[product.status]}</DescriptionItem>
          <DescriptionItem term="Availability">
            {inStock ? "In stock" : "Unavailable"}
          </DescriptionItem>
          <DescriptionItem term="Stock on hand">{product.stock}</DescriptionItem>
        </DescriptionList>
      </div>
    </Modal>
  )
}
