// Public entry for `@plainworks/demo` — the concrete fake commerce/SaaS fixture set (users, orders,
// products, tasks, content, notifications, settings, dashboard) and the `createMockApi` graph that
// statically wires them together. It is the demonstration payload built on the `@plainworks/mocks`
// primitives, not framework infrastructure: a consumer building mocks for *their own* entities
// reaches for the `@plainworks/mocks` surface instead. Everything here is a factory — importing
// this module creates no stores or other state.

// Composition root: one isolated demo mock graph (handlers + stores + control) per call.
export type { MockApi, MockApiOptions } from "./api"
export { createMockApi } from "./api"

// Seeded entity factories and settings storage for the demo domain.
export { createContentFactory } from "./data/content"
export {
  createDashboardStats,
  createRevenueChartData,
  createUserGrowthChartData,
  generateDailySales,
  generateMonthlyRevenue,
  generateProductSales,
} from "./data/dashboard"
export { createNotificationFactory } from "./data/notifications"
export { createOrderFactory } from "./data/orders"
export { createProductFactory } from "./data/products"
export type { SettingsStore } from "./data/settings"
export { createSettingsStore, createUserSettings, updateUserSettings } from "./data/settings"
export { createTaskFactory } from "./data/tasks"
export { createUserFactory } from "./data/users"

// Demo domain types.
export * from "./types"
