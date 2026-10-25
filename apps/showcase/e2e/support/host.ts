import {
  BROWSER_GATE_NOW,
  type BrowserGateHost,
  FIXED_NOW_ENV,
} from "@plainworks/testkit/playwright"

/** The showcase directory, where the host and Playwright run. */
export const APP_DIR: string = new URL("../../", import.meta.url).pathname

const basePort = Number(process.env.E2E_BASE_PORT ?? 5199)

/**
 * Where `vite.gate.config.ts` writes this run's bundle, one folder per base port so runs side by
 * side never empty each other's files. Gitignored.
 */
export const GATE_BUILD_DIR: string = `${APP_DIR}.gate-build/e2e-${basePort}`

/**
 * How to start the showcase's dev SSR host, with Vite transforming modules on demand. `ui:capture`
 * starts it, also from a base commit's worktree.
 */
export const SHOWCASE_HOST: BrowserGateHost = {
  command: ["bun", "run", "server.ts"],
  cwd: APP_DIR,
  basePort,
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

/**
 * How to start the browser gate's host: the same server over the prebuilt bundle in
 * {@link GATE_BUILD_DIR}. One serves the whole run; each test's data scope keeps workers apart.
 */
export const SHOWCASE_GATE_HOST: BrowserGateHost = {
  command: ["bun", "run", "server.ts"],
  cwd: APP_DIR,
  basePort,
  // The signed-out login page always answers 200 without a session.
  readyPath: "/login",
  startTimeoutMs: 30_000,
  warmPaths: ["/"],
  env: () => ({
    [FIXED_NOW_ENV]: BROWSER_GATE_NOW,
    TZ: "UTC",
    SHOWCASE_BUILD_DIR: GATE_BUILD_DIR,
  }),
}
