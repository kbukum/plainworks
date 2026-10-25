import { expect } from "@playwright/test"
import { createBrowserGate } from "../../src/playwright/gate"

// Run it with `GATE_SCENARIO=shared bun run e2e:pw scope.spec.ts`: the config's global setup then
// starts one host that every worker shares.
const scenario = process.env.GATE_SCENARIO ?? "success"

const test = createBrowserGate({
  dataScope: {
    header: "gate-scope",
    release: async (request) => {
      const response = await request.post("/scope/release")
      if (!response.ok()) throw new Error(`release failed: ${response.status()}`)
    },
  },
  ...(scenario === "shared-setup-failure"
    ? {
        signIn: async () => {
          throw new Error("sign-in failed on purpose")
        },
      }
    : {}),
})

test.skip(!scenario.startsWith("shared"), "needs the shared host from GATE_SCENARIO=shared")

for (const index of [1, 2, 3, 4]) {
  test(`scoped context ${index}`, async ({ page, request, gateScope }) => {
    expect(gateScope).toMatch(/^[0-9a-f-]{36}$/)
    await page.goto("/scoped")
    await expect(page.locator("#scope")).toHaveText(gateScope ?? "")
    expect(await page.evaluate(async () => (await fetch("/scope")).text())).toBe(gateScope)
    expect(await (await page.request.get("/scope")).text()).toBe(gateScope)
    expect(await (await request.get("/scope")).text()).toBe(gateScope)
  })
}
