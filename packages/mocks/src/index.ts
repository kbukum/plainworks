// Server-safe public entry for `@plainworks/mocks` — explicit, minimal surface. The mock servers
// live in subpath entries: `@plainworks/mocks/server` (msw/node) and `@plainworks/mocks/vite-plugin`
// (dev middleware). Everything is a factory — importing this module creates no stores, workers, or
// other state.

// Composition root: one isolated mock graph (handlers + stores + control) per call.
export type { MockApi, MockApiOptions } from "./api"
export { createMockApi } from "./api"

// Data primitives for custom entities.
export type { EntityFactory, EntityFactoryConfig, EntityStore, FixtureSources } from "./data/common"
export { createEntityFactory, createFixtureSources, createStore } from "./data/common"

// Seeded entity factories and settings storage.
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
export type { FilterCondition, FilterOperator, FilterQuery } from "./filter"
// PostgREST/Supabase-style filter parsing.
export { parseApiParams } from "./filter"

// Handler builders for custom entities and control endpoints.
export { type CrudHandlerConfig, createCrudHandlers } from "./handlers/common"
export type {
  InternalState,
  MockControl,
  MockControlGraph,
  RequestLogEntry,
} from "./handlers/internal"
export { createMockControl } from "./handlers/internal"

// Domain types.
export * from "./types"

// Pure utilities (filter/sort/paginate/dates/ids) plus the seeded random source and latency seam.
export { applyFieldSelection } from "./utils/applyFieldSelection"
export { daysAgo, daysFromNow, formatDate, nowISOString } from "./utils/date"
export { createLatency, type LatencyController } from "./utils/delay"
export {
  computeFacets,
  computeFacetsWithFilters,
  filterByApiParams,
  filterByConditions,
  filterByField,
  filterByFields,
  filterBySearch,
} from "./utils/filtering"
export { generateId, generateUUID } from "./utils/id"
export { type PaginationParams, type PaginationResult, paginate } from "./utils/pagination"
export {
  createSeededRandom,
  type RandomSource,
  randomBoolean,
  randomElement,
  randomElements,
  randomFloat,
  randomInt,
  randomString,
} from "./utils/random"
export { type SortDirection, type SortParams, sortBy } from "./utils/sorting"
