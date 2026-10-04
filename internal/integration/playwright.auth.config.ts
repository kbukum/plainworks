import { browserGateUse } from "@plainworks/testkit/playwright"
import { defineConfig, devices } from "@playwright/test"

/**
 * Real gokit auth-host browser acceptance. One worker owns one fixture, SQLite state file, and host
 * process; each test resets that backend before signing in, so saved cookie state is never reused.
 */
export default defineConfig({
  testDir: "src/system",
  testMatch: ["auth.spec.ts", "auth-flows.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [["list"]],
  outputDir: ".ui-artifacts/proof/auth-playwright",
  globalSetup: "./src/system/auth-setup.ts",
  use: { ...browserGateUse, trace: "off", screenshot: "off", video: "off" },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
})
