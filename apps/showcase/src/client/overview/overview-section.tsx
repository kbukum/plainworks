"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@plainworks/elements/card"
import { useHttpClient } from "@plainworks/http/client"
import { asyncStatus } from "@plainworks/ui"
import { AsyncState } from "@plainworks/ui/feedback/async-state"
import { EmptyState } from "@plainworks/ui/feedback/empty-state"
import { ErrorState } from "@plainworks/ui/feedback/error-state"
import { LoadingState } from "@plainworks/ui/feedback/loading-state"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { type ReactElement, useState } from "react"
import { REVENUE_TREND_DAYS } from "../../neutral/constants"
import { overviewStatsPlan, productSalesPlan, revenueTrendPlan } from "../../neutral/overview-read"
import { ActivityFeed } from "./activity-feed"
import { DateRangeControl } from "./date-range-control"
import { ProductSalesVisual } from "./product-sales-visual"
import { StatCards, StatCardsError, StatCardsSkeleton } from "./stat-cards"
import { TrendVisual } from "./trend-visual"

/**
 * The Overview dashboard: server-prefetched headline stats, revenue and product-sales visuals, and
 * the recent activity feed. Each independent hydrated query owns mutually exclusive loading,
 * error, empty, and content states. The reads run identically on the server prefetch and the
 * client, so the first paint is the hydrated data with no refetch flash.
 */
export function OverviewSection(): ReactElement {
  const httpClient = useHttpClient()
  const [days, setDays] = useState(REVENUE_TREND_DAYS)
  const stats = useQuery(overviewStatsPlan(httpClient))
  const revenue = useQuery({
    ...revenueTrendPlan(httpClient, days),
    placeholderData: keepPreviousData,
  })
  const productSales = useQuery(productSalesPlan(httpClient))

  return (
    <div className="@container/main grid gap-4">
      {stats.isPending ? (
        <StatCardsSkeleton />
      ) : stats.isError ? (
        <StatCardsError onRetry={() => void stats.refetch()} />
      ) : stats.data === undefined ? null : (
        <StatCards stats={stats.data} />
      )}

      <div className="grid gap-4 @4xl/main:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>
              <h2>Revenue trend</h2>
            </CardTitle>
            <DateRangeControl days={days} onChange={setDays} />
          </CardHeader>
          <CardContent>
            <AsyncState
              status={asyncStatus({
                pending: revenue.isPending && revenue.data === undefined,
                error: revenue.isError,
                empty: revenue.data?.data.length === 0,
              })}
              loading={<LoadingState label="Loading revenue trend" lines={4} />}
              error={
                <ErrorState
                  title="Revenue trend is unavailable"
                  description="The revenue series could not be loaded."
                  onRetry={() => void revenue.refetch()}
                />
              }
              empty={
                <EmptyState
                  title="No revenue data for this period"
                  description="Choose a broader date range or check back after the next sale."
                />
              }
            >
              {revenue.data === undefined ? null : <TrendVisual revenue={revenue.data} />}
            </AsyncState>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>
              <h2>Top products</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AsyncState
              status={asyncStatus({
                pending: productSales.isPending,
                error: productSales.isError,
                empty: productSales.data?.length === 0,
              })}
              loading={<LoadingState label="Loading top products" lines={4} />}
              error={
                <ErrorState
                  title="Product sales are unavailable"
                  description="The product breakdown could not be loaded."
                  onRetry={() => void productSales.refetch()}
                />
              }
              empty={
                <EmptyState
                  title="No product sales yet"
                  description="Product performance will appear after the first sale."
                />
              }
            >
              {productSales.data === undefined ? null : (
                <ProductSalesVisual products={productSales.data} />
              )}
            </AsyncState>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Recent activity</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityFeed />
        </CardContent>
      </Card>
    </div>
  )
}
