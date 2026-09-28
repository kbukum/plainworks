import { planFlowSuite, runFlow } from "@plainworks/testkit/browser"
import { NEXT_HOST_FLOWS } from "./flows/suite"
import { test } from "./support/gate"
import { NEXT_HOST_THEME_AXES } from "./support/theme-axes"

// One test per flow and device, each asserting every checkpoint at the quick preset.
const suite = planFlowSuite(NEXT_HOST_FLOWS, { axes: NEXT_HOST_THEME_AXES })

for (const planned of suite.runs) {
  test.describe(planned.title, () => {
    test.use(planned.use)
    test("flow", async ({ page, runtimeErrors }, testInfo) => {
      // Each checkpoint visits every variant of the matrix in place, so a flow outlives one test.
      test.setTimeout(300_000)
      await runFlow({ page, runtimeErrors }, planned, { mode: suite.mode, testInfo })
    })
  })
}
