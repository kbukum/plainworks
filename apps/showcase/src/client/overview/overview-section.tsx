"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@plainworks/elements/card"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { type ReactElement, useState } from "react"
import { REVENUE_TREND_DAYS } from "../../app/constants"
import { overviewStatsPlan, productSalesPlan, revenueTrendPlan } from "../../app/overview-read"
import { SectionState } from "../feedback"
import { useHttpClient } from "../http-client"
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
    <section aria-label="Overview" className="grid gap-4 @container/main">
      {stats.isPending ? (
        <StatCardsSkeleton />
      ) : stats.isError ? (
        <StatCardsError />
      ) : stats.data === undefined ? null : (
        <StatCards stats={stats.data} />
      )}

      <div className="grid gap-4 @4xl/main:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>Revenue trend</CardTitle>
            <DateRangeControl days={days} onChange={setDays} />
          </CardHeader>
          <CardContent>
            <SectionState
              pending={revenue.isPending && revenue.data === undefined}
              error={revenue.isError}
              isEmpty={!revenue.isPending && !revenue.isError && revenue.data?.data.length === 0}
              empty={{
                title: "No revenue data for this period",
                body: "Choose a broader date range or check back after the next sale.",
              }}
              loadingLabel="Loading revenue trend"
              errorTitle="Revenue trend is unavailable"
              errorBody="The revenue series could not be loaded. Try again shortly."
            >
              {revenue.data === undefined || revenue.data.data.length === 0 ? null : (
                <TrendVisual revenue={revenue.data} />
              )}
            </SectionState>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Top products</CardTitle>
          </CardHeader>
          <CardContent>
            <SectionState
              pending={productSales.isPending}
              error={productSales.isError}
              isEmpty={
                !productSales.isPending && !productSales.isError && productSales.data?.length === 0
              }
              empty={{
                title: "No product sales yet",
                body: "Product performance will appear after the first sale.",
              }}
              loadingLabel="Loading top products"
              errorTitle="Product sales are unavailable"
              errorBody="The product breakdown could not be loaded. Try again shortly."
            >
              {productSales.data === undefined || productSales.data.length === 0 ? null : (
                <ProductSalesVisual products={productSales.data} />
              )}
            </SectionState>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityFeed />
        </CardContent>
      </Card>
    </section>
  )
}
