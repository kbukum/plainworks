// Node-side MSW setup for tests. Kept out of the server-safe `.` entry because `msw/node` pulls in
// Node-only interceptors. Every call builds a fresh `MockApi` (seeded fixtures, stores, control
// state), so two servers are fully isolated.

import { type SetupServer, setupServer } from "msw/node"
import { createMockApi, type MockApi } from "./api"

/**
 * Build a fresh MSW node server for `api` (defaults to a new isolated mock API per call).
 *
 * `setupServer` does not configure `listen()`: pass `{ onUnhandledRequest: "error" }` yourself so
 * requests without a matching handler fail loudly instead of passing through with a warning.
 */
export function createMockServer(api: MockApi = createMockApi()): SetupServer {
  return setupServer(...api.handlers)
}
