import { setupFlowRun } from "@plainworks/testkit/playwright"
import { UI_ARTIFACTS } from "../ui-capture.config"

// Playwright's `globalSetup`: one flow run per invocation, finished by the returned teardown.
export default (): Promise<() => Promise<void>> => setupFlowRun({ root: UI_ARTIFACTS })
