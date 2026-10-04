import { createBrowserGate, planFlowSuite, runFlow } from "@plainworks/testkit/playwright"
import { authFlow } from "./auth-flow"
import { authHost, resetAuthHost } from "./auth-host"

const test = createBrowserGate({ host: authHost(), resetHost: resetAuthHost, now: null })
const suite = planFlowSuite([authFlow])

for (const planned of suite.runs) {
  test.describe(planned.title, () => {
    test.use(planned.use)
    test("flow", async ({ page, runtimeErrors }, testInfo) => {
      await runFlow({ page, runtimeErrors }, planned, { mode: suite.mode, testInfo })
    })
  })
}
