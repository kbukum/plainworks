import { join } from "node:path"
import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test"
import { browserGateUse } from "../../src/playwright/gate"

// `gate.test.ts` drives it with its own data directory and reads the JSON report; `bun run e2e:pw`
// runs one spec directly (`bun run e2e:pw journey.spec.ts`) and keeps its data in the ignored
// package cache.
const data =
  process.env.GATE_DATA_DIR ?? join(import.meta.dirname, "../../node_modules/.cache/gate")

const config: PlaywrightTestConfig = defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  globalSetup: join(import.meta.dirname, "shared-setup.ts"),
  fullyParallel: true,
  workers: Number(process.env.GATE_WORKERS ?? "1"),
  retries: 0,
  timeout: 30_000,
  reporter: [["json", { outputFile: join(data, "report.json") }]],
  outputDir: join(data, "results"),
  use: { ...browserGateUse, trace: "off", screenshot: "off", video: "off" },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
})

export default config
