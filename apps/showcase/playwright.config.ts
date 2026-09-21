import { defineConfig, devices } from "@playwright/test"

// The browser E2E gate. It boots the same dev SSR host the smoke tests drive and covers functional
// flows, stable visual snapshots, and the WCAG rules jsdom cannot measure without layout.
// It complements the deterministic-DOM axe floor every client component already carries in unit
// tests (`@plainworks/testkit`'s `expectNoAxeViolations`), which disables exactly these rules.
const PORT = Number(process.env.PORT ?? 5199)
const HOST = "127.0.0.1"
const BASE_URL = `http://${HOST}:${PORT}`

export default defineConfig({
  testDir: "e2e",
  // A11y results must be reproducible: no retries hiding a flake, one worker over the single shared
  // dev host, and `.only` rejected in CI.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
      stylePath: "./e2e/screenshot.css",
    },
  },
  use: {
    baseURL: BASE_URL,
    // A fixed desktop viewport so the narrow-viewport reflow check starts from a known width.
    viewport: { width: 1280, height: 800 },
    // Retries are off for determinism, so capture a trace on the single failing attempt.
    trace: "retain-on-failure",
  },
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{platform}/{arg}{ext}",
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
  webServer: {
    command: "bun run server.ts",
    // Every app route redirects an unauthenticated request into the login chain, so readiness pings
    // the Vite dev server's own always-200 client-runtime endpoint instead of following that chain.
    url: `${BASE_URL}/@vite/client`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
