// `bun run ui:capture`: capture the showcase's flows as frames to look at, optionally against a
// base.
import { runUiCaptureCli } from "@plainworks/testkit/browser"
import { SHOWCASE_UI_CAPTURE } from "./ui-capture.config"

process.exitCode = await runUiCaptureCli(SHOWCASE_UI_CAPTURE)
