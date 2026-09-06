/**
 * Dashboard API handlers
 */

import { type HttpHandler, HttpResponse, http } from "msw"
import type { FixtureSources } from "../data/common"
import {
  createDashboardStats,
  createRevenueChartData,
  createUserGrowthChartData,
  generateDailySales,
  generateMonthlyRevenue,
  generateProductSales,
} from "../data/dashboard"
import type { LatencyController } from "../utils/delay"

// Endpoint-specific ceilings: counts are network-controlled, so generators never allocate or loop
// beyond these bounds.
const MAX_DAYS = 366
const MAX_MONTHS = 120
const MAX_TOP_PRODUCTS = 100

/** Parse a positive-integer query param bounded by `max`; `null` when present but invalid. */
function parseCount(value: string | null, defaultValue: number, max: number): number | null {
  if (value === null || value === "") return defaultValue
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) return null
  return parsed
}

/** Build the `/api/dashboard/*` handlers against this server's fixture sources. */
export function createDashboardHandlers(
  sources: FixtureSources,
  latency: LatencyController,
): HttpHandler[] {
  return [
    // GET /api/dashboard/stats
    http.get("*/api/dashboard/stats", async ({ request }) => {
      await latency.wait(request.signal)
      return HttpResponse.json({ data: createDashboardStats(sources) })
    }),

    // GET /api/dashboard/overview - returns summary stats for dashboard cards
    http.get("*/api/dashboard/overview", async ({ request }) => {
      await latency.wait(request.signal)
      return HttpResponse.json(createDashboardStats(sources))
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
      return HttpResponse.json(generateDailySales(sources, days))
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
      return HttpResponse.json(generateMonthlyRevenue(sources, months))
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
      return HttpResponse.json(generateProductSales(sources, limit))
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
      return HttpResponse.json({ data: createRevenueChartData(sources, days) })
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
      return HttpResponse.json({ data: createUserGrowthChartData(sources, days) })
    }),
  ]
}
