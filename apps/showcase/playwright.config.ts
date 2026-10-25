import { availableParallelism } from "node:os"
import { DEFAULT_MOCK_SCOPE_CAPACITY } from "@plainworks/mocks/scope"
import { browserGateUse } from "@plainworks/testkit/playwright"
import { defineConfig, devices } from "@playwright/test"

// The showcase browser gate: every flow (`e2e/flows/`) checked at each checkpoint, plus functional
// specs, over the SSR host with a fixed clock, locale, time zone, and motion. It complements the
// jsdom axe floor every client component carries in its unit tests. See `docs/browser-gate.md`.
//
// The run builds the app once and starts one host over that bundle (`e2e/support/gate-host.ts`).
// Each test gets its own data scope on it, then resets and signs in (`e2e/support/gate.ts`), so
// workers never read each other's data and the suite runs in parallel.
const CI = Boolean(process.env.CI)

// Half the cores, but never more than a quarter of the host's scope capacity: a test holds at most
// two live scopes, and an evicted scope would silently reseed another test's data.
const LOCAL_WORKERS = Math.max(
  1,
  Math.min(Math.floor(availableParallelism() / 2), DEFAULT_MOCK_SCOPE_CAPACITY / 4),
)

export default defineConfig({
  testDir: "e2e",
  // Tests are independent (each resets its own data scope), so they run in parallel.
  fullyParallel: true,
  // Each worker adds a browser on the shared host, and more than half the cores only contends for
  // CPU without finishing sooner. CI's 3 on a 4-core runner is a first choice for now; tune it from
  // measured CI runs.
  workers: CI ? 3 : LOCAL_WORKERS,
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
  // The shared host, then one flow run per invocation: `flows.spec.ts` writes into it, and the
  // teardown publishes `.ui-artifacts/latest/report.md`. `ui:capture` owns the run itself.
  globalSetup: ["./e2e/support/gate-host.ts", "./e2e/support/flow-run.ts"],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
