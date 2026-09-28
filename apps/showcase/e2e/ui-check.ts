// `bun run ui:check`: capture the showcase's flows, review what changed, and print the verdict.
import { runUiCheckCli } from "@plainworks/testkit/browser"
import { SHOWCASE_UI_CHECK } from "./ui-check.config"

process.exitCode = await runUiCheckCli(SHOWCASE_UI_CHECK)
