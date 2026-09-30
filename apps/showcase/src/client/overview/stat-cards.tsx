"use client"

import type { DashboardStats } from "@plainworks/demo"
import { Button } from "@plainworks/elements/button"
import { MetricCard, MetricList } from "@plainworks/ui/display/metric-card"
import { NumberValue } from "@plainworks/ui/display/number-value"
import { LoadingState } from "@plainworks/ui/feedback/loading-state"
import type { ReactElement } from "react"
import { DISPLAY_LOCALE } from "../../neutral/constants"
import { GrowthBadge } from "./growth-badge"

const STAT_LABELS = ["Total users", "Total orders", "Revenue", "Products"] as const

function growthDetail(value: number): ReactElement {
  return <GrowthBadge value={value} periodLabel="from last period" />
}

/** Props for {@link StatCards}. */
export interface StatCardsProps {
  /** The validated summary statistics for the current period. */
  readonly stats: DashboardStats
}

/**
 * The Overview headline: four kit `MetricCard`s formatted through the kit's SSR-stable
 * {@link NumberValue} — counts, a currency total, and signed growth badges — laid out in a
 * `MetricList` that reflows from one column to four.
 */
export function StatCards({ stats }: StatCardsProps): ReactElement {
  return (
    <MetricList>
      <MetricCard
        label="Total users"
        value={<NumberValue value={stats.totalUsers} locale={DISPLAY_LOCALE} />}
        detail={growthDetail(stats.userGrowth)}
      />
      <MetricCard
        label="Total orders"
        value={<NumberValue value={stats.totalOrders} locale={DISPLAY_LOCALE} />}
        detail={growthDetail(stats.orderGrowth)}
      />
      <MetricCard
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
      <MetricCard
        label="Products"
        value={<NumberValue value={stats.totalProducts} locale={DISPLAY_LOCALE} />}
        detail="Listed in the catalog"
      />
    </MetricList>
  )
}

/** Four card-shaped loading placeholders that preserve the dashboard layout. */
export function StatCardsSkeleton(): ReactElement {
  return (
    <MetricList>
      {STAT_LABELS.map((label) => (
        <MetricCard
          key={label}
          label={label}
          detail={<LoadingState label={`Loading ${label}`} lines={2} />}
        />
      ))}
    </MetricList>
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
      <MetricList>
        {STAT_LABELS.map((label) => (
          <MetricCard
            key={label}
            label={label}
            value={<span className="text-base text-muted-foreground">Unavailable</span>}
          />
        ))}
      </MetricList>
    </section>
  )
}
