/**
 * Dashboard API handlers
 */

import type { LatencyController } from "@plainworks/mocks"
import type { FixtureSources } from "@plainworks/mocks/data"
import { isPositiveInteger } from "@plainworks/std"
import { type HttpHandler, HttpResponse, http } from "msw"
import {
  createDashboardStats,
  createRevenueChartData,
  createUserGrowthChartData,
  generateDailySales,
  generateMonthlyRevenue,
  generateProductSales,
} from "../data/dashboard"

// Endpoint-specific ceilings: counts are network-controlled, so generators never allocate or loop
// beyond these bounds.
const MAX_DAYS = 366
const MAX_MONTHS = 120
const MAX_TOP_PRODUCTS = 100

/** Parse a positive-integer query param bounded by `max`; `null` when present but invalid. */
function parseCount(value: string | null, defaultValue: number, max: number): number | null {
  if (value === null || value === "") return defaultValue
  const parsed = Number(value)
  if (!isPositiveInteger(parsed) || parsed > max) return null
  return parsed
}

/**
 * Fixture sources for one dashboard read. Each read draws from its own stream keyed by the endpoint
 * and its parameters, so a repeated read answers identically — whatever was read in between.
 */
export type DashboardSources = (read: string) => FixtureSources

/** Build the `/api/dashboard/*` handlers; every read is a pure function of its request. */
export function createDashboardHandlers(
  sourcesFor: DashboardSources,
  latency: LatencyController,
): HttpHandler[] {
  return [
    // GET /api/dashboard/stats
    http.get("*/api/dashboard/stats", async ({ request }) => {
      await latency.wait(request.signal)
      return HttpResponse.json({ data: createDashboardStats(sourcesFor("stats")) })
    }),

    // GET /api/dashboard/overview - returns summary stats for dashboard cards
    http.get("*/api/dashboard/overview", async ({ request }) => {
      await latency.wait(request.signal)
      return HttpResponse.json(createDashboardStats(sourcesFor("stats")))
    }),

    // GET /api/dashboard/daily-sales - returns daily sales data for charts
    http.get("*/api/dashboard/daily-sales", async ({ request }) => {
      await latency.wait(request.signal)
      const days = parseCount(new URL(request.url).searchParams.get("days"), 7, MAX_DAYS)
      if (days === null) {
        return HttpResponse.json(
          { error: `days must be a positive integer up to ${MAX_DAYS}` },
          { status: 400 },
        )
      }
      return HttpResponse.json(generateDailySales(sourcesFor(`daily-sales:${days}`), days))
    }),

    // GET /api/dashboard/monthly-revenue - returns monthly revenue data for charts
    http.get("*/api/dashboard/monthly-revenue", async ({ request }) => {
      await latency.wait(request.signal)
      const months = parseCount(new URL(request.url).searchParams.get("months"), 12, MAX_MONTHS)
      if (months === null) {
        return HttpResponse.json(
          { error: `months must be a positive integer up to ${MAX_MONTHS}` },
          { status: 400 },
        )
      }
      return HttpResponse.json(
        generateMonthlyRevenue(sourcesFor(`monthly-revenue:${months}`), months),
      )
    }),

    // GET /api/dashboard/top-products - returns top selling products
    http.get("*/api/dashboard/top-products", async ({ request }) => {
      await latency.wait(request.signal)
      const limit = parseCount(new URL(request.url).searchParams.get("limit"), 5, MAX_TOP_PRODUCTS)
      if (limit === null) {
        return HttpResponse.json(
          { error: `limit must be a positive integer up to ${MAX_TOP_PRODUCTS}` },
          { status: 400 },
        )
      }
      return HttpResponse.json(generateProductSales(sourcesFor(`top-products:${limit}`), limit))
    }),

    // GET /api/dashboard/revenue
    http.get("*/api/dashboard/revenue", async ({ request }) => {
      await latency.wait(request.signal)
      const days = parseCount(new URL(request.url).searchParams.get("days"), 30, MAX_DAYS)
      if (days === null) {
        return HttpResponse.json(
          { error: `days must be a positive integer up to ${MAX_DAYS}` },
          { status: 400 },
        )
      }
      return HttpResponse.json({
        data: createRevenueChartData(sourcesFor(`revenue:${days}`), days),
      })
    }),

    // GET /api/dashboard/user-growth
    http.get("*/api/dashboard/user-growth", async ({ request }) => {
      await latency.wait(request.signal)
      const days = parseCount(new URL(request.url).searchParams.get("days"), 30, MAX_DAYS)
      if (days === null) {
        return HttpResponse.json(
          { error: `days must be a positive integer up to ${MAX_DAYS}` },
          { status: 400 },
        )
      }
      return HttpResponse.json({
        data: createUserGrowthChartData(sourcesFor(`user-growth:${days}`), days),
      })
    }),
  ]
}
