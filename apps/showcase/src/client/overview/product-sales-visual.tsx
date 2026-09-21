"use client"

import type { ProductSales } from "@plainworks/demo"
import { NumberValue } from "@plainworks/ui/display"
import type { ReactElement } from "react"
import { DISPLAY_LOCALE } from "../../app/constants"

const BAR_WIDTH = 100
const BAR_HEIGHT = 8

/** Props for {@link ProductSalesVisual}. */
export interface ProductSalesVisualProps {
  readonly products: readonly ProductSales[]
}

/**
 * A compact product-sales breakdown with decorative proportional bars and visible text values.
 * The labels and values carry the information, so the visual never depends on color or motion.
 */
export function ProductSalesVisual({ products }: ProductSalesVisualProps): ReactElement {
  const maximum = Math.max(...products.map((product) => product.sales), 1)
  const rankedProducts = products.toSorted((left, right) => right.sales - left.sales)

  return (
    <ol aria-label="Sales by product" className="grid gap-4">
      {rankedProducts.map((product) => (
        <li key={product.product} className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-medium">{product.product}</span>
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              <NumberValue value={product.sales} locale={DISPLAY_LOCALE} /> sales
            </span>
          </div>
          <svg
            aria-hidden
            viewBox={`0 0 ${BAR_WIDTH} ${BAR_HEIGHT}`}
            preserveAspectRatio="none"
            className="h-2 w-full overflow-hidden rounded-full text-primary"
          >
            <rect
              width={BAR_WIDTH}
              height={BAR_HEIGHT}
              rx={BAR_HEIGHT / 2}
              fill="currentColor"
              opacity="0.12"
            />
            <rect
              width={(product.sales / maximum) * BAR_WIDTH}
              height={BAR_HEIGHT}
              rx={BAR_HEIGHT / 2}
              fill="currentColor"
            />
          </svg>
        </li>
      ))}
    </ol>
  )
}
