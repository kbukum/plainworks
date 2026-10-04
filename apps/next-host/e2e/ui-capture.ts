import { runUiCaptureCli } from "@plainworks/testkit/playwright"
import { NEXT_HOST_FLOWS } from "./flows/suite"
import { NEXT_HOST_SERVER } from "./support/server"
import { NEXT_HOST_THEME_AXES } from "./support/theme-axes"

process.exitCode = await runUiCaptureCli({
  app: "@plainworks/next-host",
  appDir: "apps/next-host",
  root: ".ui-artifacts",
  spec: "e2e/flows.spec.ts",
  flows: NEXT_HOST_FLOWS,
  axes: NEXT_HOST_THEME_AXES,
  host: NEXT_HOST_SERVER,
  warmPort: 5290,
})
