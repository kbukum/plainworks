import { browserGateScreenshot, browserGateUse } from "@plainworks/testkit/browser"
import { defineConfig, devices } from "@playwright/test"

// The showcase browser gate: functional flows, WCAG 2.2 AA axe, reflow, and screenshot baselines
// over the dev SSR host, with a fixed clock, locale, time zone, and motion. It complements the
// jsdom axe floor every client component carries in its unit tests. See `docs/browser-gate.md`.
//
// Each worker starts its own host on its own port and signs in once (`e2e/support/gate.ts`), so
// workers never share a backend and the suite runs in parallel.
const CI = Boolean(process.env.CI)

export default defineConfig({
  testDir: "e2e",
  // Tests are independent (each resets its worker's demo backend), so they run and shard singly.
  fullyParallel: true,
  // Half the cores: each worker runs a Vite host and a browser, and more than that only contends
  // for CPU without finishing sooner.
  workers: CI ? 2 : "50%",
  // No retries: a flaky visual or a11y result is a defect to fix, not to hide.
  retries: 0,
  forbidOnly: CI,
  // Baselines change only through `e2e:update`, never as a side effect of a run.
  updateSnapshots: "none",
  reporter: CI ? [["github"], ["list"], ["blob"]] : [["list"], ["html", { open: "never" }]],
  expect: { toHaveScreenshot: browserGateScreenshot },
  use: {
    ...browserGateUse,
    trace: "retain-on-failure",
  },
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{platform}/{arg}{ext}",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
