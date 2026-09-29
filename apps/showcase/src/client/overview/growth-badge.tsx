"use client"

import { NumberValue } from "@plainworks/ui/display/number-value"
import { StatusBadge } from "@plainworks/ui/display/status-badge"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import type { ReactElement } from "react"
import { DISPLAY_LOCALE } from "../../app/constants"

/** Props for {@link GrowthBadge}. */
export interface GrowthBadgeProps {
  readonly value: number
  readonly periodLabel: string
}

/** A signed period change with distinct increase, decrease, and no-change states. */
export function GrowthBadge({ value, periodLabel }: GrowthBadgeProps): ReactElement {
  const direction = value === 0 ? "neutral" : value > 0 ? "increase" : "decrease"
  const Arrow =
    direction === "neutral" ? Minus : direction === "increase" ? ArrowUpRight : ArrowDownRight

  return (
    <StatusBadge
      tone={direction === "neutral" ? "neutral" : direction === "increase" ? "success" : "danger"}
      className="gap-1"
    >
      <Arrow aria-hidden className="size-3.5" />
      <NumberValue
        value={value / 100}
        locale={DISPLAY_LOCALE}
        options={{ style: "percent", signDisplay: "exceptZero", maximumFractionDigits: 1 }}
      />
      <span className="sr-only">
        {direction === "neutral" ? " no change" : ` ${direction}`} {periodLabel}
      </span>
    </StatusBadge>
  )
}
