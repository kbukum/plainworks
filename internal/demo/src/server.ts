// Node-side MSW setup for tests. Kept out of the server-safe `.` entry because `msw/node` pulls in
// Node-only interceptors. Every call builds a fresh `MockApi` (seeded fixtures, stores, control
// state), so two servers are fully isolated.

import { type SetupServer, setupServer } from "msw/node"
import { createMockApi, type MockApi, type MockApiOptions } from "./api"

/**
 * Build a fresh MSW node server for `api` (defaults to a new isolated mock API per call).
 *
 * `setupServer` does not configure `listen()`: pass `{ onUnhandledRequest: "error" }` yourself so
 * requests without a matching handler fail loudly instead of passing through with a warning.
 */
export function createMockServer(api: MockApi = createMockApi()): SetupServer {
  return setupServer(...api.handlers)
}

/** A mock server paired with the {@link MockApi} it serves — see {@link createMockServerHandle}. */
export interface MockServerHandle {
  /** The MSW node server. The test owns its lifecycle: `listen({ onUnhandledRequest: "error" })` in
   * `beforeAll`, `resetHandlers()` in `afterEach`, `close()` in `afterAll`. */
  readonly server: SetupServer
  /** The isolated api behind the server — for programmatic state access and `reset()` between cases. */
  readonly api: MockApi
}

/**
 * Build a seeded {@link MockApi} and its {@link createMockServer} together, so a cross-package test
 * gets both halves it needs without hand-wiring them: the `server` to install as the network
 * boundary and the `api` to inspect stores or `reset()` seeded state between cases. This is the
 * shared harness the boundary/contract tests mount — the test still owns the `listen`/`close`
 * lifecycle (below), keeping msw decoupled from any test framework.
 */
export function createMockServerHandle(options?: MockApiOptions): MockServerHandle {
  const api = createMockApi(options)
  return { server: createMockServer(api), api }
}
