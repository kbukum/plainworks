// Server-safe public entry for `@plainworks/mocks` — the reusable mock-building **framework
// primitives** only: entity factories, an in-memory store, CRUD handler generation, the mock
// control plane, the REST filter dialect, and the query/fixture utilities. The concrete demo
// domain (users, orders, products, and the `createMockApi` graph that wires them) lives behind
// `@plainworks/mocks/domain`; the mock servers live behind `@plainworks/mocks/server` (msw/node)
// and `@plainworks/mocks/vite-plugin` (dev middleware). Everything is a factory — importing this
// module creates no stores, workers, or other state.

// Data primitives for custom entities.
export type { EntityFactory, EntityFactoryConfig, EntityStore, FixtureSources } from "./data/common"
export { createEntityFactory, createFixtureSources, createStore } from "./data/common"

// PostgREST/Supabase-style filter dialect: one codec shared by serializer and parser.
export type { FilterCondition, FilterOperator, FilterQuery } from "./filter"
export { parseApiParams } from "./filter"

// Fixture-generation primitives: seeded randomness plus id and date helpers.
export {
  createSeededRandom,
  daysAgo,
  daysFromNow,
  formatDate,
  generateId,
  generateUUID,
  nowISOString,
  type RandomSource,
  randomBoolean,
  randomElement,
  randomElements,
  randomFloat,
  randomInt,
  randomString,
} from "./fixture"

// Handler builders for custom entities and the control plane.
export { type CrudHandlerConfig, createCrudHandlers } from "./handlers/common"
export type {
  InternalState,
  MockControl,
  MockControlGraph,
  RequestLogEntry,
} from "./handlers/internal"
export { createMockControl } from "./handlers/internal"

// The latency seam applied before a response.
export { createLatency, type LatencyController } from "./latency"

// List-response query primitives (filter/sort/paginate/field selection).
export {
  applyFieldSelection,
  computeFacets,
  computeFacetsWithFilters,
  filterByApiParams,
  filterByConditions,
  filterByField,
  filterByFields,
  filterBySearch,
  type PaginationParams,
  type PaginationResult,
  paginate,
  type SortDirection,
  type SortParams,
  sortBy,
} from "./query"
