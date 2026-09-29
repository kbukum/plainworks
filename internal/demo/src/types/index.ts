/**
 * Types index - re-exports all types
 */

export type { ApiError, ApiResponse, PaginatedResponse, PaginationInfo } from "./api"
export type { ContentPage, CreateContentPageInput, UpdateContentPageInput } from "./content"
export type {
  ChartDataPoint,
  DailySales,
  DashboardStats,
  MonthlyRevenue,
  ProductSales,
  RevenueChartData,
  UserGrowthChartData,
} from "./dashboard"
export type { CreateNotificationInput, Notification } from "./notification"
export type { CreateOrderInput, Order, OrderItem } from "./order"
export type { CreateProductInput, Product, UpdateProductInput } from "./product"
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
} from "./settings"
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
} from "./settings"
export type { CreateTaskInput, Task, TaskPriority, UpdateTaskInput } from "./task"
export { TASK_PRIORITIES, taskPriorityRank } from "./task"
export type {
  CreateUserInput,
  UpdateUserInput,
  User,
  UserDepartment,
  UserRole,
  UserStatus,
} from "./user"
