/**
 * Dashboard data generators
 */

import type {
  ChartDataPoint,
  DailySales,
  DashboardStats,
  MonthlyRevenue,
  ProductSales,
  RevenueChartData,
  UserGrowthChartData,
} from "../types"
import { daysAgo } from "../utils"
import { randomElements, randomFloat, randomInt } from "../utils/random"
import type { FixtureSources } from "./common"

const PRODUCT_NAMES = [
  "Widget Pro",
  "Gadget Plus",
  "Super Tool",
  "Power Device",
  "Smart Item",
  "Premium Kit",
  "Essential Pack",
  "Deluxe Set",
  "Standard Unit",
  "Basic Model",
]

/** Aggregate stat cards for the dashboard header. */
export function createDashboardStats(sources: FixtureSources): DashboardStats {
  const { rng } = sources
  return {
    totalUsers: randomInt(rng, 1000, 10000),
    totalOrders: randomInt(rng, 500, 5000),
    totalRevenue: randomFloat(rng, 50000, 500000),
    totalProducts: randomInt(rng, 100, 1000),
    userGrowth: randomFloat(rng, -5, 25),
    orderGrowth: randomFloat(rng, -10, 30),
    revenueGrowth: randomFloat(rng, -5, 20),
  }
}

/** Revenue time series for the past `days` days. */
export function createRevenueChartData(sources: FixtureSources, days = 30): RevenueChartData {
  const { rng, clock } = sources
  const data: ChartDataPoint[] = Array.from({ length: days }, (_, i) => ({
    date: daysAgo(clock, days - 1 - i),
    value: randomFloat(rng, 1000, 10000),
    label: `Day ${i + 1}`,
  }))

  const total = data.reduce((sum, d) => sum + d.value, 0)

  return {
    data,
    total: Number(total.toFixed(2)),
    growth: randomFloat(rng, -10, 25),
  }
}

/** New-users time series for the past `days` days. */
export function createUserGrowthChartData(sources: FixtureSources, days = 30): UserGrowthChartData {
  const { rng, clock } = sources
  const data: ChartDataPoint[] = Array.from({ length: days }, (_, i) => ({
    date: daysAgo(clock, days - 1 - i),
    value: randomInt(rng, 10, 100),
    label: `Day ${i + 1}`,
  }))

  const total = data.reduce((sum, d) => sum + d.value, 0)

  return {
    data,
    total,
    growth: randomFloat(rng, -5, 30),
  }
}

/** Generate daily sales data for charts. */
export function generateDailySales(sources: FixtureSources, numDays = 30): DailySales[] {
  const { rng, clock } = sources
  const sales: DailySales[] = []
  for (let i = numDays - 1; i >= 0; i--) {
    sales.push({
      date: daysAgo(clock, i),
      sales: randomInt(rng, 100, 1000),
    })
  }
  return sales
}

/**
 * Generate product sales data for charts. Names are drawn from a shuffled candidate list (never a
 * retry loop, so no RNG stream can hang it); once the unique names run out, repeats get a numeric
 * suffix so the requested count is always honored.
 */
export function generateProductSales(sources: FixtureSources, numProducts = 10): ProductSales[] {
  const { rng } = sources
  const names = randomElements(rng, PRODUCT_NAMES, Math.min(numProducts, PRODUCT_NAMES.length))
  return Array.from({ length: numProducts }, (_, i) => {
    const base = names[i % names.length] ?? "Product"
    const cycle = Math.floor(i / names.length)
    return {
      product: cycle === 0 ? base : `${base} ${cycle + 1}`,
      sales: randomInt(rng, 10, 200),
    }
  })
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/**
 * Generate monthly revenue data for charts. Steps a real calendar date backwards month by month,
 * so spans longer than a year roll over correctly (no negative modulo into the month names).
 */
export function generateMonthlyRevenue(sources: FixtureSources, numMonths = 12): MonthlyRevenue[] {
  const { rng, clock } = sources
  const cursor = new Date(clock.now())
  cursor.setUTCDate(1) // avoid day-of-month rollover when stepping backwards

  const series: MonthlyRevenue[] = []
  for (let i = 0; i < numMonths; i++) {
    // UTC accessors keep the labels timezone-independent: same clock → same series anywhere.
    series.unshift({
      month: `${MONTH_LABELS[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
      revenue: randomInt(rng, 5000, 50000),
    })
    cursor.setUTCMonth(cursor.getUTCMonth() - 1)
  }
  return series
}
