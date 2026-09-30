import { setupFlowRun } from "@plainworks/testkit/playwright"

/** Where flow runs land, relative to the Next host. Gitignored. */
export const UI_ARTIFACTS = ".ui-artifacts"

// Playwright's `globalSetup`: one flow run per invocation, finished by the returned teardown.
export default (): Promise<() => Promise<void>> => setupFlowRun({ root: UI_ARTIFACTS })
