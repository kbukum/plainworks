"use client"

import type { Product } from "@plainworks/demo"
import { Badge } from "@plainworks/elements/badge"
import { Button } from "@plainworks/elements/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@plainworks/elements/card"
import { NumberValue } from "@plainworks/ui/display"
import type { ReactElement } from "react"
import { DISPLAY_LOCALE } from "../../app/constants"
import { PRODUCT_STATUS_LABEL, PRODUCT_STATUS_TONE, productInStock } from "./product-fields"

const currency = { style: "currency", currency: "USD" } as const

/** Props for {@link ProductCard}. */
export interface ProductCardProps {
  /** The product to summarize. */
  readonly product: Product
  /** Open the product's detail overlay. */
  readonly onView: (product: Product) => void
}

/**
 * One product tile in the fluid grid: category and status badges, the name, a clamped description,
 * the currency-formatted price, and a stock line, with a footer action opening the full detail. The
 * whole card is a fluid grid cell — no fixed width — so it reflows from one column on a narrow
 * container up to as many as fit.
 */
export function ProductCard({ product, onView }: ProductCardProps): ReactElement {
  const inStock = productInStock(product)
  return (
    <Card className="grid grid-rows-[auto_1fr_auto] content-start border-border/70 transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-md motion-reduce:transition-none">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{product.category}</Badge>
          <Badge variant={PRODUCT_STATUS_TONE[product.status]}>
            {PRODUCT_STATUS_LABEL[product.status]}
          </Badge>
        </div>
        <CardTitle className="text-base">{product.name}</CardTitle>
      </CardHeader>
      <CardContent className="grid content-start gap-2">
        {product.description === undefined ? null : (
          <p className="line-clamp-3 text-muted-foreground text-sm">{product.description}</p>
        )}
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-3">
        <div className="grid">
          <span className="font-semibold text-lg">
            <NumberValue value={product.price} locale={DISPLAY_LOCALE} options={currency} />
          </span>
          <span className="text-muted-foreground text-xs">
            {inStock ? `${product.stock} in stock` : "Unavailable"}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => onView(product)}>
          View
          <span className="sr-only"> details for {product.name}</span>
        </Button>
      </CardFooter>
    </Card>
  )
}
