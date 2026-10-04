import { browserGateUse } from "@plainworks/testkit/playwright"
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "src/system",
  testMatch: ["flows.spec.ts", "trust.spec.ts"],
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  outputDir: ".ui-artifacts/proof/playwright",
  globalSetup: "./src/system/flow-run.ts",
  use: { ...browserGateUse, trace: "off", screenshot: "off", video: "off" },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
})
