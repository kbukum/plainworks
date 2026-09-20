"use client"

import type { DashboardStats } from "@plainworks/demo"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@plainworks/elements/card"
import { NumberValue } from "@plainworks/ui/display"
import type { ReactElement, ReactNode } from "react"
import { DISPLAY_LOCALE } from "../../app/constants"
import { GrowthBadge } from "./growth-badge"

/** One headline metric: a label, its formatted value, and an optional growth badge. */
function StatCard({
  label,
  value,
  growth,
}: {
  readonly label: string
  readonly value: ReactNode
  readonly growth?: number
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {growth !== undefined ? (
        <CardContent>
          <GrowthBadge value={growth} periodLabel="from last period" />
        </CardContent>
      ) : null}
    </Card>
  )
}

/** Props for {@link StatCards}. */
export interface StatCardsProps {
  /** The validated summary statistics for the current period. */
  readonly stats: DashboardStats
}

/**
 * The Overview headline: four metric cards formatted through the kit's SSR-stable
 * {@link NumberValue} — counts, a currency total, and signed growth badges — laid out in a fluid,
 * mobile-first grid that reflows from one column to four without a fixed-pixel break.
 */
export function StatCards({ stats }: StatCardsProps): ReactElement {
  return (
    <div className="grid grid-cols-1 gap-4 @sm/main:grid-cols-2 @4xl/main:grid-cols-4">
      <StatCard
        label="Total users"
        value={<NumberValue value={stats.totalUsers} locale={DISPLAY_LOCALE} />}
        growth={stats.userGrowth}
      />
      <StatCard
        label="Total orders"
        value={<NumberValue value={stats.totalOrders} locale={DISPLAY_LOCALE} />}
        growth={stats.orderGrowth}
      />
      <StatCard
        label="Revenue"
        value={
          <NumberValue
            value={stats.totalRevenue}
            locale={DISPLAY_LOCALE}
            options={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
          />
        }
        growth={stats.revenueGrowth}
      />
      <StatCard
        label="Products"
        value={<NumberValue value={stats.totalProducts} locale={DISPLAY_LOCALE} />}
      />
    </div>
  )
}
