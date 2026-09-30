import { browserGateUse } from "@plainworks/testkit/playwright"
import { defineConfig, devices } from "@playwright/test"

// The Next host's browser gate: every flow (`e2e/flows/`) checked at each checkpoint, plus
// functional specs, over `next dev` so the development inspector is part of the proof. The fixed
// clock, locale, time zone, and motion come from `@plainworks/testkit/playwright`. See
// `docs/browser-gate.md`.
//
// Each worker starts its own `next dev` on its own port and signs in once (`e2e/support/gate.ts`),
// so workers never share a backend and the suite runs in parallel.
const CI = Boolean(process.env.CI)

export default defineConfig({
  testDir: "e2e",
  // Tests are independent (each resets its worker's mock backend), so they run in parallel.
  fullyParallel: true,
  // A quarter of the cores: each worker compiles its own Next dev server, heavier than a Vite one.
  workers: CI ? 1 : "25%",
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
  // `.ui-artifacts/latest/report.md`.
  globalSetup: "./e2e/support/flow-run.ts",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
