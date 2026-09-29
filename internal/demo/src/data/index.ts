/**
 * Data factories index - re-exports all data factories
 */

export { createContentFactory } from "./content"
export {
  createDashboardStats,
  createRevenueChartData,
  createUserGrowthChartData,
  generateDailySales,
  generateMonthlyRevenue,
  generateProductSales,
} from "./dashboard"
export { createNotificationFactory } from "./notifications"
export { createOrderFactory } from "./orders"
export { createProductFactory } from "./products"
export type { SettingsStore } from "./settings"
export { createSettingsStore, createUserSettings, updateUserSettings } from "./settings"
export { createTaskFactory } from "./tasks"
export { createUserFactory } from "./users"
