"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@plainworks/elements/card"
import { Callout, SkeletonText } from "@plainworks/ui/feedback"
import { useQuery } from "@tanstack/react-query"
import type { ReactElement } from "react"
import { overviewStatsPlan, revenueTrendPlan } from "../../app/overview-read"
import { useHttpClient } from "../http-client"
import { ActivityFeed } from "./activity-feed"
import { StatCards } from "./stat-cards"
import { TrendVisual } from "./trend-visual"

/**
 * The Overview dashboard: server-prefetched headline stats, a revenue trend visual, and the recent
 * activity feed — each an independent hydrated query with its own loading and error state, composed
 * from kit atoms and display primitives. The reads run identically on the server prefetch and the
 * client, so the first paint is the hydrated data with no refetch flash.
 */
export function OverviewSection(): ReactElement {
  const httpClient = useHttpClient()
  const stats = useQuery(overviewStatsPlan(httpClient))
  const revenue = useQuery(revenueTrendPlan(httpClient))

  return (
    <section aria-label="Overview" className="grid gap-4 @container/main">
      {stats.isPending ? (
        <div role="status" aria-label="Loading summary statistics">
          <SkeletonText lines={4} />
        </div>
      ) : stats.isError ? (
        <Callout tone="danger" title="Summary statistics are unavailable">
          The dashboard metrics could not be loaded. Try again shortly.
        </Callout>
      ) : (
        <StatCards stats={stats.data} />
      )}

      <div className="grid gap-4 @3xl/main:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue trend</CardTitle>
          </CardHeader>
          <CardContent>
            {revenue.isPending ? (
              <div role="status" aria-label="Loading revenue trend">
                <SkeletonText lines={4} />
              </div>
            ) : revenue.isError ? (
              <Callout tone="danger" title="Revenue trend is unavailable">
                The revenue series could not be loaded. Try again shortly.
              </Callout>
            ) : (
              <TrendVisual revenue={revenue.data} />
            )}
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
