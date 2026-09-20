// The Overview data reads through their validation boundary, shared by the SSR prefetch and the
// client query. Each mock response is a decoded `unknown` narrowed to a typed value by a Standard
// Schema at the `client.get` seam — the same validation path a real consumer uses — so a malformed
// response fails the read instead of being trusted. Neutral and server-safe: it names no host
// global, so the server prefetch and the browser query run it alike.

import type { DashboardStats, RevenueChartData } from "@plainworks/demo"
import type { createHttpClient } from "@plainworks/http"
import { guardSchema, isRecord, type WebAbortSignal } from "@plainworks/std"
import type { QueryFunctionContext, QueryKey } from "@tanstack/react-query"
import { OVERVIEW_STATS_KEY, REVENUE_TREND_DAYS, REVENUE_TREND_KEY } from "./constants"

type HttpClient = ReturnType<typeof createHttpClient>

/** A ready-to-spread single-value query plan: a stable key plus a cancellable, validated read. */
export interface QueryPlan<T> {
  readonly queryKey: QueryKey
  readonly queryFn: (context: QueryFunctionContext) => Promise<T>
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

// The summary block is trusted only when every headline counter and growth rate is a finite
// number — a partial or `NaN`-bearing payload fails the read instead of rendering a bogus stat.
const dashboardStatsSchema = guardSchema<DashboardStats>(
  (value): value is DashboardStats =>
    isRecord(value) &&
    isFiniteNumber(value.totalUsers) &&
    isFiniteNumber(value.totalOrders) &&
    isFiniteNumber(value.totalRevenue) &&
    isFiniteNumber(value.totalProducts) &&
    isFiniteNumber(value.userGrowth) &&
    isFiniteNumber(value.orderGrowth) &&
    isFiniteNumber(value.revenueGrowth),
  "response is not a DashboardStats",
)

function isChartPoint(value: unknown): boolean {
  return isRecord(value) && typeof value.date === "string" && isFiniteNumber(value.value)
}

// The revenue trend is trusted only when every plotted point carries a date and a finite value and
// the totals are numbers — so the sparkline and its table equivalent never render a broken series.
const revenueChartSchema = guardSchema<{ readonly data: RevenueChartData }>(
  (value): value is { readonly data: RevenueChartData } =>
    isRecord(value) &&
    isRecord(value.data) &&
    Array.isArray(value.data.data) &&
    value.data.data.every(isChartPoint) &&
    isFiniteNumber(value.data.total) &&
    isFiniteNumber(value.data.growth),
  "response is not a RevenueChartData envelope",
)

/** Read the Overview summary statistics, validated at the boundary; a bodyless response fails. */
export async function readOverviewStats(
  client: HttpClient,
  signal?: WebAbortSignal,
): Promise<DashboardStats> {
  const stats = await client.get("/api/dashboard/overview", {
    ...(signal ? { signal } : {}),
    schema: dashboardStatsSchema,
  })
  if (stats === undefined) {
    throw new Error("GET /api/dashboard/overview returned no body")
  }
  return stats
}

/** Read the revenue trend series, validated at the boundary; a bodyless response fails. */
export async function readRevenueTrend(
  client: HttpClient,
  days: number,
  signal?: WebAbortSignal,
): Promise<RevenueChartData> {
  const envelope = await client.get("/api/dashboard/revenue", {
    query: { days: String(days) },
    ...(signal ? { signal } : {}),
    schema: revenueChartSchema,
  })
  if (envelope === undefined) {
    throw new Error("GET /api/dashboard/revenue returned no body")
  }
  return envelope.data
}

/** The Overview summary-statistics plan — prefetched on the server, mounted under the same key. */
export function overviewStatsPlan(client: HttpClient): QueryPlan<DashboardStats> {
  return {
    queryKey: OVERVIEW_STATS_KEY,
    queryFn: ({ signal }) => readOverviewStats(client, signal),
  }
}

/** The Overview revenue-trend plan — prefetched on the server, mounted under the same key. */
export function revenueTrendPlan(client: HttpClient): QueryPlan<RevenueChartData> {
  return {
    queryKey: [...REVENUE_TREND_KEY, REVENUE_TREND_DAYS],
    queryFn: ({ signal }) => readRevenueTrend(client, REVENUE_TREND_DAYS, signal),
  }
}
