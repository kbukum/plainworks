import { browserGateScreenshot, browserGateUse } from "@plainworks/testkit/browser"
import { defineConfig, devices } from "@playwright/test"

// The Next host's browser gate: the same functional, WCAG 2.2 AA axe, reflow, and screenshot checks
// as the showcase, over `next dev` so the development inspector is part of the proof. The fixed
// clock, locale, time zone, and motion come from `@plainworks/testkit/browser`. See
// `docs/browser-gate.md`.
//
// Each worker starts its own `next dev` on its own port and signs in once (`e2e/support/gate.ts`),
// so workers never share a backend and the suite runs in parallel.
const CI = Boolean(process.env.CI)

export default defineConfig({
  testDir: "e2e",
  // Tests are independent (each resets its worker's mock backend), so they run and shard singly.
  fullyParallel: true,
  // A quarter of the cores: each worker compiles its own Next dev server, heavier than a Vite one.
  workers: CI ? 1 : "25%",
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
