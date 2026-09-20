"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@plainworks/elements/card"
import { useQuery } from "@tanstack/react-query"
import type { ReactElement } from "react"
import { overviewStatsPlan, revenueTrendPlan } from "../../app/overview-read"
import { SectionState } from "../feedback"
import { useHttpClient } from "../http-client"
import { ActivityFeed } from "./activity-feed"
import { StatCards } from "./stat-cards"
import { TrendVisual } from "./trend-visual"

/**
 * The Overview dashboard: server-prefetched headline stats, a revenue trend visual, and the recent
 * activity feed — each an independent hydrated query rendered behind the shared
 * {@link SectionState} gate, so loading, error, and empty read the same across the app. The reads
 * run identically on the server prefetch and the client, so the first paint is the hydrated data
 * with no refetch flash.
 */
export function OverviewSection(): ReactElement {
  const httpClient = useHttpClient()
  const stats = useQuery(overviewStatsPlan(httpClient))
  const revenue = useQuery(revenueTrendPlan(httpClient))

  return (
    <section aria-label="Overview" className="grid gap-4 @container/main">
      <SectionState
        pending={stats.isPending}
        error={stats.isError}
        loadingLabel="Loading summary statistics"
        errorTitle="Summary statistics are unavailable"
        errorBody="The dashboard metrics could not be loaded. Try again shortly."
      >
        {stats.data === undefined ? null : <StatCards stats={stats.data} />}
      </SectionState>

      <div className="grid gap-4 @3xl/main:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue trend</CardTitle>
          </CardHeader>
          <CardContent>
            <SectionState
              pending={revenue.isPending}
              error={revenue.isError}
              loadingLabel="Loading revenue trend"
              errorTitle="Revenue trend is unavailable"
              errorBody="The revenue series could not be loaded. Try again shortly."
            >
              {revenue.data === undefined ? null : <TrendVisual revenue={revenue.data} />}
            </SectionState>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed />
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
