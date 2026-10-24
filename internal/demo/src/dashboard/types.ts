/**
 * Dashboard and analytics types
 */

/** Aggregate stat cards for the dashboard header. */
export interface DashboardStats {
  totalUsers: number
  totalOrders: number
  totalRevenue: number
  totalProducts: number
  userGrowth: number
  orderGrowth: number
  revenueGrowth: number
}

/** One point on a chart time series. */
export interface ChartDataPoint {
  date: string
  value: number
  label?: string
}

/** Revenue chart payload: the series plus summary metrics. */
export interface RevenueChartData {
  data: ChartDataPoint[]
  total: number
  growth: number
}

/** User-growth chart payload: the series plus summary metrics. */
export interface UserGrowthChartData {
  data: ChartDataPoint[]
  total: number
  growth: number
}

/** Sales total for one day. */
export interface DailySales {
  date: string
  sales: number
}

/** Sales total for one product. */
export interface ProductSales {
  product: string
  sales: number
}

/** Revenue total for one month. */
export interface MonthlyRevenue {
  month: string
  revenue: number
}
