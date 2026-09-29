"use client"

import type { DashboardStats } from "@plainworks/demo"
import { Button } from "@plainworks/elements/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@plainworks/elements/card"
import { NumberValue } from "@plainworks/ui/display/number-value"
import { LoadingState } from "@plainworks/ui/feedback/loading-state"
import type { ReactElement, ReactNode } from "react"
import { DISPLAY_LOCALE } from "../../app/constants"
import { GrowthBadge } from "./growth-badge"

const STAT_LABELS = ["Total users", "Total orders", "Revenue", "Products"] as const

/** One headline metric: a label, its formatted value, and a supporting line. */
function StatCard({
  label,
  value,
  detail,
}: {
  readonly label: string
  readonly value: ReactNode
  /** The supporting line: a growth badge or a short caption, so every card has the same shape. */
  readonly detail: ReactNode
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-caption text-muted-foreground">{detail}</CardContent>
    </Card>
  )
}

function growthDetail(value: number): ReactElement {
  return <GrowthBadge value={value} periodLabel="from last period" />
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
        detail={growthDetail(stats.userGrowth)}
      />
      <StatCard
        label="Total orders"
        value={<NumberValue value={stats.totalOrders} locale={DISPLAY_LOCALE} />}
        detail={growthDetail(stats.orderGrowth)}
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
        detail={growthDetail(stats.revenueGrowth)}
      />
      <StatCard
        label="Products"
        value={<NumberValue value={stats.totalProducts} locale={DISPLAY_LOCALE} />}
        detail="Listed in the catalog"
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

/** Props for {@link StatCardsError}. */
export interface StatCardsErrorProps {
  /** Retry the summary read. */
  readonly onRetry: () => void
}

/** A card-preserving failure state for a summary read that failed as one atomic payload. */
export function StatCardsError({ onRetry }: StatCardsErrorProps): ReactElement {
  return (
    <section role="alert" aria-labelledby="summary-error-title" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="summary-error-title" className="font-semibold text-destructive">
          Summary statistics are unavailable
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
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
