import { createBrowserGate, planFlowSuite, runFlow } from "@plainworks/testkit/playwright"
import { publicHostFlow } from "./public-flow"
import { publicHost } from "./public-host"

const test = createBrowserGate({ host: publicHost() })
const suite = planFlowSuite([publicHostFlow()])

for (const planned of suite.runs) {
  test.describe(planned.title, () => {
    test.use(planned.use)
    test("flow", async ({ page, runtimeErrors, gateHost }, testInfo) => {
      await runFlow(
        { page, runtimeErrors },
        {
          ...planned,
          flow: publicHostFlow(gateHost),
        },
        { mode: suite.mode, testInfo },
      )
    })
  })
}
