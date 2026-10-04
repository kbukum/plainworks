import { join } from "node:path"
import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test"
import { browserGateUse } from "../../src/playwright/gate"

// Driven only by `gate.test.ts`, which owns the data directory and reads the JSON report.
const data = process.env.GATE_DATA_DIR ?? ".gate"

const config: PlaywrightTestConfig = defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
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
