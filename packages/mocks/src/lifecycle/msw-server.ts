import type { RequestHandler } from "msw"
import { type SetupServer, setupServer } from "msw/node"

/** Runner lifecycle hooks the server binds its listen, reset, and close to. */
export interface MockServerHooks {
  readonly beforeAll: (setup: () => void) => void
  readonly afterEach: (reset: () => void) => void
  readonly afterAll: (close: () => void) => void
}

/** Options for {@link bindMockServerLifecycle}. */
export interface MockServerLifecycleOptions {
  readonly hooks: MockServerHooks
  /** How the server treats a request no handler matches. Defaults to `"error"`. */
  readonly onUnhandledRequest?: "error" | "warn" | "bypass"
}

/** Options for {@link installMockServer}. */
export interface InstallMockServerOptions extends MockServerLifecycleOptions {
  readonly handlers?: readonly RequestHandler[]
}

/**
 * Bind a caller-owned MSW node server to the runner's hooks: listen before all tests, reset
 * handlers after each, and close after all.
 */
export function bindMockServerLifecycle(
  server: SetupServer,
  { hooks, onUnhandledRequest = "error" }: MockServerLifecycleOptions,
): void {
  hooks.beforeAll(() => server.listen({ onUnhandledRequest }))
  hooks.afterEach(() => server.resetHandlers())
  hooks.afterAll(() => server.close())
}

/**
 * Create an MSW node server and bind its ownership to the caller's test runner hooks.
 *
 * Unhandled requests fail by default. Importing this module creates no server or global hooks.
 */
export function installMockServer({
  handlers = [],
  ...lifecycle
}: InstallMockServerOptions): SetupServer {
  const server = setupServer(...handlers)
  bindMockServerLifecycle(server, lifecycle)
  return server
}
