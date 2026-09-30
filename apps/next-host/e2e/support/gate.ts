import {
  createApiRequestMockControlTransport,
  createMockControlClient,
} from "@plainworks/mocks/control"
import { BROWSER_GATE_NOW, createBrowserGate, FIXED_NOW_ENV } from "@plainworks/testkit/playwright"
import { expect } from "@playwright/test"
import { signIn } from "./session"

const APP_DIR = new URL("../../", import.meta.url).pathname

/**
 * The `test` every Next host spec uses. Each worker runs its own `next dev` and signs in once. Each
 * test starts from the seeded task fixtures with mock errors and latency off, reads a fixed "now",
 * and fails on any runtime error, hydration error, or off-origin request.
 */
export const test = createBrowserGate({
  host: {
    command: ["bunx", "next", "dev", "--hostname", "127.0.0.1"],
    cwd: APP_DIR,
    basePort: Number(process.env.E2E_BASE_PORT ?? 5299),
    // The public overview answers 200 without a session once the first compile finishes.
    readyPath: "/",
    // Compile every route once, so the first test on each does not wait for it.
    warmPaths: ["/tasks", "/account", "/auth/interrupted"],
    env: ({ port, origin }) => ({
      APP_ORIGIN: origin,
      NEXT_TELEMETRY_DISABLED: "1",
      [FIXED_NOW_ENV]: BROWSER_GATE_NOW,
      TZ: "UTC",
      // Next allows one dev server per output directory.
      PLAINWORKS_E2E_DIST_DIR: `.next/e2e-${port}`,
    }),
  },
  signIn,
  resetHost: async (request) => {
    const control = createMockControlClient({
      client: createApiRequestMockControlTransport(request, { basePath: "/api" }),
    })
    await control.restore()
  },
})

export { expect }
