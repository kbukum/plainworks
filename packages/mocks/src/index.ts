// Server-safe public entry for `@plainworks/mocks` — the reusable mock-building **framework
// primitives**: entity factories, an in-memory store, CRUD handler generation, the mock control
// plane, the REST filter dialect, and the query/fixture utilities — the pieces you compose to mock
// your own API. The `msw/node` server harness a test installs is built from the api you assemble;
// the Vite dev middleware lives behind `@plainworks/mocks/vite-plugin`. A worked example that wires
// these primitives into a full commerce/SaaS mock graph lives in the dev-only `@plainworks/demo`
// fixtures package. Everything is a factory — importing this module creates no stores, workers, or
// other state.

// The mock control plane: server handlers, and a typed client that drives them over HTTP.
export {
  createMockControl,
  createMockControlClient,
  type InternalState,
  MOCK_CONTROL_PATHS,
  type MockControl,
  type MockControlClient,
  type MockControlClientOptions,
  MockControlError,
  type MockControlGraph,
  type MockControlTransport,
  type RequestLogEntry,
} from "./control"
// Data primitives for custom entities.
export type {
  EntityFactory,
  EntityFactoryConfig,
  EntityStore,
  FixtureSources,
  ReloadableFixtureSources,
} from "./data/common"
export {
  createEntityFactory,
  createFixtureSources,
  createReloadableFixtureSources,
  createStore,
} from "./data/common"
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
// Handler builders for custom entities.
export {
  type CrudHandlerConfig,
  createCrudHandlers,
  type InputSpec,
  type MutationAuthorizer,
} from "./handlers/common"

// The latency seam applied before a response.
export { createLatency, type LatencyController, MAX_LATENCY_MS } from "./latency"

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
  type ValueComparator,
} from "./query"
