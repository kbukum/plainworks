import { runUiCaptureCli } from "@plainworks/testkit/playwright"
import { authFlow } from "./auth-flow"
import { authHost } from "./auth-host"

process.exitCode = await runUiCaptureCli({
  app: "@plainworks/integration",
  appDir: "internal/integration",
  root: ".ui-artifacts/proof/auth-capture",
  spec: "src/system/auth-flows.spec.ts",
  playwrightConfig: "playwright.auth.config.ts",
  flows: [authFlow],
  host: authHost(),
  warmPort: 7440,
})
