import { BROWSER_GATE_NOW, createBrowserGate, FIXED_NOW_ENV } from "@plainworks/testkit/browser"
import { expect } from "@playwright/test"
import { signIn } from "./session"

const APP_DIR = new URL("../../", import.meta.url).pathname

/**
 * The `test` every showcase spec uses. Each worker runs its own dev SSR host and signs in once.
 * Each test starts from the seeded demo data with mock errors and latency off, reads a fixed
 * "now", and fails on any runtime error or off-origin request.
 */
export const test = createBrowserGate({
  host: {
    command: ["bun", "run", "server.ts"],
    cwd: APP_DIR,
    basePort: Number(process.env.E2E_BASE_PORT ?? 5199),
    // Every app route redirects an unauthenticated request into the login chain, so readiness
    // pings the Vite dev server's own always-200 client-runtime endpoint instead.
    readyPath: "/@vite/client",
    // Render one page, so the first test does not pay for the server graph's cold transform.
    warmPaths: ["/"],
    env: ({ port }) => ({
      [FIXED_NOW_ENV]: BROWSER_GATE_NOW,
      TZ: "UTC",
      // Concurrent Vite servers must not pre-bundle dependencies into one shared cache.
      SHOWCASE_VITE_CACHE_DIR: `node_modules/.vite/e2e-${port}`,
    }),
  },
  signIn,
  resetHost: async (request) => {
    for (const [path, data] of [
      ["/mock/reset", undefined],
      ["/mock/error", { enabled: false }],
      ["/mock/latency", { latency: 0 }],
    ] as const) {
      const response = await request.post(path, data === undefined ? {} : { data })
      expect(response.ok(), `${path} answered ${response.status()}`).toBe(true)
    }
  },
})

export { expect }
