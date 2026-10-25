import { availableParallelism } from "node:os"
import { DEFAULT_MOCK_SCOPE_CAPACITY } from "@plainworks/mocks/scope"
import { browserGateUse } from "@plainworks/testkit/playwright"
import { defineConfig, devices } from "@playwright/test"

// The Next host's browser gate: every flow (`e2e/flows/`) checked at each checkpoint, plus
// functional specs, over `next dev` so the development inspector is part of the proof. The fixed
// clock, locale, time zone, and motion come from `@plainworks/testkit/playwright`. See
// `docs/browser-gate.md`.
//
// Every worker shares one `next dev` (`e2e/support/gate-host.ts`). Each test reads and writes only
// its own data scope, then resets and signs in (`e2e/support/gate.ts`), so the suite runs in
// parallel without workers seeing each other's data.
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
  // The host compiles once, so each worker only adds a browser. CI's 2 is a first choice for now;
  // tune it from measured CI runs.
  workers: CI ? 2 : LOCAL_WORKERS,
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
  globalSetup: ["./e2e/support/gate-host.ts", "./e2e/support/flow-run.ts"],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
