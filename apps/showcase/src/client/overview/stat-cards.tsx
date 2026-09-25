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
import { LoadingState } from "@plainworks/ui/feedback"
import type { ReactElement, ReactNode } from "react"
import { DISPLAY_LOCALE } from "../../app/constants"
import { GrowthBadge } from "./growth-badge"

const STAT_LABELS = ["Total users", "Total orders", "Revenue", "Products"] as const

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

/** Four card-shaped loading placeholders that preserve the dashboard layout. */
export function StatCardsSkeleton(): ReactElement {
  return (
    <div className="grid grid-cols-1 gap-4 @sm/main:grid-cols-2 @4xl/main:grid-cols-4">
      {STAT_LABELS.map((label) => (
        <Card key={label}>
          <CardHeader>
            <CardDescription>{label}</CardDescription>
          </CardHeader>
          <CardContent>
            <LoadingState label={`Loading ${label}`} lines={2} />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/** A card-preserving failure state for a summary read that failed as one atomic payload. */
export function StatCardsError(): ReactElement {
  return (
    <section role="alert" aria-labelledby="summary-error-title" className="grid gap-3">
      <h2 id="summary-error-title" className="font-semibold text-destructive">
        Summary statistics are unavailable
      </h2>
      <div className="grid grid-cols-1 gap-4 @sm/main:grid-cols-2 @4xl/main:grid-cols-4">
        {STAT_LABELS.map((label) => (
          <Card key={label}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-muted-foreground text-base">Unavailable</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  )
}
