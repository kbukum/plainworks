"use client"

import type { Product } from "@plainworks/demo"
import { Badge } from "@plainworks/elements/badge"
import { NumberValue } from "@plainworks/ui/display"
import { Modal } from "@plainworks/ui/overlays"
import type { ReactElement, ReactNode } from "react"
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
function DetailField({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}

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
            <Badge variant={PRODUCT_STATUS_TONE[product.status]}>
              {PRODUCT_STATUS_LABEL[product.status]}
            </Badge>
          </div>
          <span className="font-semibold text-xl">
            <NumberValue value={product.price} locale={DISPLAY_LOCALE} options={currency} />
          </span>
        </div>

        {product.description === undefined ? null : (
          <p className="text-muted-foreground text-sm">{product.description}</p>
        )}

        <dl className="grid gap-4 @sm:grid-cols-2">
          <DetailField label="Category">{product.category}</DetailField>
          <DetailField label="Status">{PRODUCT_STATUS_LABEL[product.status]}</DetailField>
          <DetailField label="Availability">{inStock ? "In stock" : "Unavailable"}</DetailField>
          <DetailField label="Stock on hand">{product.stock}</DetailField>
        </dl>
      </div>
    </Modal>
  )
}
