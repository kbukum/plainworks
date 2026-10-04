import {
  BROWSER_GATE_NOW,
  type BrowserGateHost,
  FIXED_NOW_ENV,
} from "@plainworks/testkit/playwright"

/** One ordinary Next dev server per worker or capture, with isolated build output. */
export const NEXT_HOST_SERVER: BrowserGateHost = {
  command: ["bunx", "next", "dev", "--hostname", "127.0.0.1"],
  cwd: new URL("../../", import.meta.url).pathname,
  basePort: Number(process.env.E2E_BASE_PORT ?? 5299),
  readyPath: "/",
  startTimeoutMs: 180_000,
  warmPaths: ["/tasks", "/account", "/auth/interrupted"],
  env: ({ port, origin }) => ({
    APP_ORIGIN: origin,
    NEXT_TELEMETRY_DISABLED: "1",
    [FIXED_NOW_ENV]: BROWSER_GATE_NOW,
    TZ: "UTC",
    PLAINWORKS_E2E_DIST_DIR: `.next/e2e-${port}`,
  }),
}
