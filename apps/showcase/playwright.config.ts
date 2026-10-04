import { browserGateUse } from "@plainworks/testkit/playwright"
import { defineConfig, devices } from "@playwright/test"

// The showcase browser gate: every flow (`e2e/flows/`) checked at each checkpoint, plus functional
// specs, over the dev SSR host with a fixed clock, locale, time zone, and motion. It complements
// the jsdom axe floor every client component carries in its unit tests. See `docs/browser-gate.md`.
//
// Each worker starts its own host on its own port; tests reset then sign in
// (`e2e/support/gate.ts`), so workers never share a backend and the suite runs in parallel.
const CI = Boolean(process.env.CI)

export default defineConfig({
  testDir: "e2e",
  // Tests are independent (each resets its worker's demo backend), so they run in parallel.
  fullyParallel: true,
  // Half the cores: each worker runs a Vite host and a browser, and more than that only contends
  // for CPU without finishing sooner.
  workers: CI ? 2 : "50%",
  // No retries: a flaky result is a defect to fix, not to hide.
  retries: 0,
  forbidOnly: CI,
  reporter: CI
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    ...browserGateUse,
    trace: "retain-on-failure",
  },
  // One flow run per invocation: `flows.spec.ts` writes into it, and the teardown publishes
  // `.ui-artifacts/latest/report.md`. `ui:capture` owns the run itself.
  globalSetup: "./e2e/support/flow-run.ts",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
