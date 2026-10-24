// Public entry for `@plainworks/demo` — the concrete fake commerce/SaaS fixture set (users, orders,
// products, tasks, content, notifications, settings, dashboard) and the `createMockApi` graph that
// statically wires them together. It is the demonstration payload built on the `@plainworks/mocks`
// primitives, not framework infrastructure: a consumer building mocks for *their own* entities
// reaches for the `@plainworks/mocks` surface instead. Everything here is a factory — importing
// this module creates no stores or other state.

// Composition root: one isolated demo mock graph (handlers + stores + control) per call.
export type { MockApi, MockApiOptions } from "./api"
export { createMockApi } from "./api"

// Each demo concern's types, seeded factory and (for settings) storage, plus the shared response
// envelope types.
export { createContentFactory } from "./content/data"
export type { ContentPage, CreateContentPageInput, UpdateContentPageInput } from "./content/types"
export {
  createDashboardStats,
  createRevenueChartData,
  createUserGrowthChartData,
  generateDailySales,
  generateMonthlyRevenue,
  generateProductSales,
} from "./dashboard/data"
export type {
  ChartDataPoint,
  DailySales,
  DashboardStats,
  MonthlyRevenue,
  ProductSales,
  RevenueChartData,
  UserGrowthChartData,
} from "./dashboard/types"
export type { ApiError, ApiResponse, PaginatedResponse, PaginationInfo } from "./envelope"
export { createNotificationFactory } from "./notifications/data"
export type { CreateNotificationInput, Notification } from "./notifications/types"
export { createOrderFactory } from "./orders/data"
export type { CreateOrderInput, Order, OrderItem } from "./orders/types"
export { createProductFactory } from "./products/data"
export type { CreateProductInput, Product, UpdateProductInput } from "./products/types"
export type { SettingsStore } from "./settings/data"
export { createSettingsStore, createUserSettings, updateUserSettings } from "./settings/data"
export type {
  SettingsLanguage,
  SettingsNotifications,
  SettingsPreferences,
  SettingsPreferencesDecodeResult,
  SettingsPreferencesIssue,
  SettingsPrivacy,
  SettingsProfile,
  SettingsProfileDecodeResult,
  SettingsProfileIssue,
  SettingsRequestAuthorizer,
  SettingsTimezone,
  UpdateSettingsInput,
  UserSettings,
} from "./settings/types"
export {
  decodeSettingsPreferencesUpdate,
  decodeSettingsProfileUpdate,
  isSettingsItemsPerPage,
  isSettingsPreferences,
  isSettingsProfile,
  SETTINGS_ITEMS_PER_PAGE_MAX,
  SETTINGS_ITEMS_PER_PAGE_MIN,
  SETTINGS_LANGUAGE_VALUES,
  SETTINGS_TIMEZONE_VALUES,
} from "./settings/types"
export { createTaskFactory } from "./tasks/data"
export type { CreateTaskInput, Task, TaskPriority, UpdateTaskInput } from "./tasks/types"
export { TASK_PRIORITIES, taskPriorityRank } from "./tasks/types"
export { createUserFactory } from "./users/data"
export type {
  CreateUserInput,
  UpdateUserInput,
  User,
  UserDepartment,
  UserRole,
  UserStatus,
} from "./users/types"
