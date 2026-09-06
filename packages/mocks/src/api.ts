/**
 * Mock API composition root.
 *
 * `createMockApi()` builds one complete, self-contained mock graph — per-domain seeded randomness,
 * clock, latency control, entity stores, settings storage, control state, and every handler
 * closing over them. Nothing lives in module scope, so two instances are fully isolated and can
 * run in parallel without observing or resetting each other.
 *
 * Determinism contract: with the same `seed` and a fixed `clock`, every fixture — content, ids,
 * and timestamps — is identical across instances, regardless of which endpoint is hit first
 * (initial fixtures are materialized eagerly from per-domain RNG streams) or how often `reset()`
 * runs (sources rewind and replay exactly).
 */

import { type Clock, systemClock } from "@plainworks/std"
import type { HttpHandler } from "msw"
import {
  createReloadableFixtureSources,
  createStore,
  type EntityStore,
  type ReloadableFixtureSources,
} from "./data/common"
import { createContentFactory } from "./data/content"
import { createNotificationFactory } from "./data/notifications"
import { createOrderFactory } from "./data/orders"
import { createProductFactory } from "./data/products"
import { createSettingsStore, type SettingsStore } from "./data/settings"
import { createTaskFactory } from "./data/tasks"
import { createUserFactory } from "./data/users"
import { createContentHandlers } from "./handlers/content"
import { createDashboardHandlers } from "./handlers/dashboard"
import { createMockControl, type MockControl } from "./handlers/internal"
import { createNotificationHandlers } from "./handlers/notifications"
import { createOrderHandlers } from "./handlers/orders"
import { createProductHandlers } from "./handlers/products"
import { createSettingsHandlers } from "./handlers/settings"
import { createTaskHandlers } from "./handlers/tasks"
import { createUserHandlers } from "./handlers/users"
import type { ContentPage, Notification, Order, Product, Task, User } from "./types"
import { createLatency, type LatencyController } from "./utils/delay"

/** Options for {@link createMockApi}. */
export interface MockApiOptions {
  /**
   * Seed for fixture generation. Same seed (plus the same `clock`) → identical fixtures, so
   * failures replay deterministically. Defaults to a fixed seed.
   */
  seed?: number
  /** Simulated latency in ms applied before every response (0 = disabled, the default). */
  latency?: number
  /** Time source for fixture timestamps (defaults to the wall clock; inject a fixed clock for
   * fully reproducible fixtures). */
  clock?: Clock
}

/** One isolated mock API: the MSW handlers plus programmatic access to its state. */
export interface MockApi {
  /** The full handler set (logging/error gate first, control endpoints last). */
  readonly handlers: HttpHandler[]
  /** Programmatic control (request log, error simulation, state snapshot). */
  readonly control: MockControl
  /** Per-server latency control. */
  readonly latency: LatencyController
  /** The entity stores behind the CRUD endpoints. */
  readonly stores: {
    readonly users: EntityStore<User>
    readonly products: EntityStore<Product>
    readonly orders: EntityStore<Order>
    readonly tasks: EntityStore<Task>
    readonly notifications: EntityStore<Notification>
    readonly content: EntityStore<ContentPage>
  }
  /** Per-user settings storage behind the settings endpoints. */
  readonly settings: SettingsStore
  /** Reset stores to freshly seeded data and clear control state (log, error flag, latency). */
  reset(): void
}

const DEFAULT_SEED = 42

/**
 * Build a fresh, isolated mock API. Pass `api.handlers` to `setupServer`/`setupWorker` (or use
 * `@plainworks/mocks/server`, which does this for you).
 */
export function createMockApi(options: MockApiOptions = {}): MockApi {
  const seed = options.seed ?? DEFAULT_SEED
  const initialLatency = options.latency ?? 0
  const clock = options.clock ?? systemClock
  const latency = createLatency(initialLatency)

  const userSources = createReloadableFixtureSources(seed, "users", clock)
  const productSources = createReloadableFixtureSources(seed, "products", clock)
  const orderSources = createReloadableFixtureSources(seed, "orders", clock)
  const taskSources = createReloadableFixtureSources(seed, "tasks", clock)
  const notificationSources = createReloadableFixtureSources(seed, "notifications", clock)
  const contentSources = createReloadableFixtureSources(seed, "content", clock)
  const dashboardSources = createReloadableFixtureSources(seed, "dashboard", clock)
  const domainSources: ReloadableFixtureSources[] = [
    userSources,
    productSources,
    orderSources,
    taskSources,
    notificationSources,
    contentSources,
  ]

  const userFactory = createUserFactory(userSources)
  const productFactory = createProductFactory(productSources)
  const orderFactory = createOrderFactory(orderSources)
  const taskFactory = createTaskFactory(taskSources)
  const notificationFactory = createNotificationFactory(notificationSources)
  const contentFactory = createContentFactory(contentSources)
  const factories = [
    userFactory,
    productFactory,
    orderFactory,
    taskFactory,
    notificationFactory,
    contentFactory,
  ]

  // Seed eagerly: materializing the initial fixtures at construction keeps the seeded set
  // identical whether a test reads a list first or creates an entity first.
  const seedAll = (): void => {
    for (const factory of factories) {
      factory.getSeeded()
    }
  }
  seedAll()

  const stores = {
    users: createStore(() => userFactory.getSeeded()),
    products: createStore(() => productFactory.getSeeded()),
    orders: createStore(() => orderFactory.getSeeded()),
    tasks: createStore(() => taskFactory.getSeeded()),
    notifications: createStore(() => notificationFactory.getSeeded()),
    content: createStore(() => contentFactory.getSeeded()),
  }
  const settings = createSettingsStore()

  const {
    control,
    loggingHandler,
    handlers: internalHandlers,
  } = createMockControl(latency, () => api.reset(), clock)

  const api: MockApi = {
    // loggingHandler must be first to capture all requests (and gate on error simulation)
    handlers: [
      loggingHandler,
      ...createUserHandlers(userFactory, stores.users, latency, clock),
      ...createProductHandlers(productFactory, stores.products, latency, clock),
      ...createOrderHandlers(orderFactory, stores.orders, latency, clock),
      ...createTaskHandlers(taskFactory, stores.tasks, latency, clock),
      ...createNotificationHandlers(notificationFactory, stores.notifications, latency, clock),
      ...createDashboardHandlers(dashboardSources, latency),
      ...createSettingsHandlers(settings, latency),
      ...createContentHandlers(contentFactory, stores.content, latency, clock),
      ...internalHandlers,
    ],
    control,
    latency,
    stores,
    settings,
    reset(): void {
      // Rewind every fixture source and regenerate the seeded snapshots before any handler can
      // draw again, so a create after reset replays exactly what it produced before.
      for (const sources of domainSources) {
        sources.reload()
      }
      for (const factory of factories) {
        factory.resetSeeded()
      }
      seedAll()
      for (const store of Object.values(stores)) {
        store.reset()
      }
      settings.reset()
      control.clearRequestLog()
      control.setError(false)
      latency.set(initialLatency)
    },
  }

  return api
}
