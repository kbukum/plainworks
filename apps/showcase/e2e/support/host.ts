import {
  BROWSER_GATE_NOW,
  type BrowserGateHost,
  FIXED_NOW_ENV,
} from "@plainworks/testkit/playwright"

/** The showcase directory, where the host and Playwright run. */
export const APP_DIR: string = new URL("../../", import.meta.url).pathname

/**
 * How to start the showcase's dev SSR host. Each worker gets its own on `basePort + n`;
 * `ui:capture` starts the same host from a base commit's worktree.
 */
export const SHOWCASE_HOST: BrowserGateHost = {
  command: ["bun", "run", "server.ts"],
  cwd: APP_DIR,
  basePort: Number(process.env.E2E_BASE_PORT ?? 5199),
  // Every app route redirects an unauthenticated request into the login chain, so readiness pings
  // the Vite dev server's own always-200 client-runtime endpoint instead.
  readyPath: "/@vite/client",
  startTimeoutMs: 180_000,
  // Render one page, so the first test does not pay for the server graph's cold transform.
  warmPaths: ["/"],
  env: ({ port }) => ({
    [FIXED_NOW_ENV]: BROWSER_GATE_NOW,
    TZ: "UTC",
    // Concurrent Vite servers must not pre-bundle dependencies into one shared cache.
    SHOWCASE_VITE_CACHE_DIR: `node_modules/.vite/e2e-${port}`,
  }),
}
