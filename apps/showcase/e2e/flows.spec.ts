import { planFlowSuite, runFlow } from "@plainworks/testkit/playwright"
import { SHOWCASE_DEVTOOLS_KEY } from "../src/client/dev-tools/enabled"
import { SHOWCASE_FLOWS } from "./flows/suite"
import { test } from "./support/gate"
import { SHOWCASE_THEME_AXES } from "./support/theme-axes"

// One test per flow and device. A plain run asserts every flow at the quick preset; `ui:capture`
// picks the flows, preset, and capture mode through the environment.
const suite = planFlowSuite(SHOWCASE_FLOWS, { axes: SHOWCASE_THEME_AXES })

// A failure checkpoint shows its error state only after the app's query retries give up, which
// takes about 7 s of backoff, so the default 10 s leaves too little room on a busy machine. A
// passing checkpoint never waits longer for this.
const TIMEOUTS = { ready: 20_000 } as const

for (const planned of suite.runs) {
  test.describe(planned.title, () => {
    test.use(planned.use)
    test("flow", async ({ page, runtimeErrors }, testInfo) => {
      // Each checkpoint visits every variant of the matrix in place, so a flow outlives one test.
      test.setTimeout(300_000)
      // Flows review the product. The development inspector has its own spec, and its live
      // request counters would read as a visual change on every run. `about:blank` has no storage.
      await page.addInitScript((key) => {
        if (window.location.protocol.startsWith("http")) window.localStorage.setItem(key, "off")
      }, SHOWCASE_DEVTOOLS_KEY)
      await runFlow({ page, runtimeErrors }, planned, {
        mode: suite.mode,
        testInfo,
        timeouts: TIMEOUTS,
      })
    })
  })
}
