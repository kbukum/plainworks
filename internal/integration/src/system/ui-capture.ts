import { runUiCaptureCli, type UiCaptureConfig } from "@plainworks/testkit/playwright"
import { publicHostFlow } from "./public-flow"
import { publicHost } from "./public-host"

const config: UiCaptureConfig = {
  app: "@plainworks/integration",
  appDir: "internal/integration",
  root: ".ui-artifacts/proof",
  spec: "src/system/flows.spec.ts",
  flows: [publicHostFlow()],
  host: publicHost(),
  warmPort: 7380,
}

process.exitCode = await runUiCaptureCli(config)
