import { expect } from "@playwright/test"
import { createBrowserGate } from "../../src/playwright/gate"

// Run it with `GATE_SCENARIO=shared bun run e2e:pw scope.spec.ts`: the config's global setup then
// starts one host that every worker shares.
const scenario = process.env.GATE_SCENARIO ?? "success"

// `shared-owned` is a suite that keeps each test's data apart itself, so the gate sends no header.
const owned = scenario === "shared-owned"

const test = createBrowserGate({
  dataScope: {
    ...(owned ? {} : { header: "gate-scope" }),
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
  test(`scoped context ${index}`, async ({ page, request, gateScope, extraHTTPHeaders }) => {
    expect(gateScope).toMatch(/^[0-9a-f-]{36}$/)
    expect(extraHTTPHeaders ?? {}).toEqual(owned ? {} : { "gate-scope": gateScope })
    const sent = owned ? "" : gateScope
    await page.goto("/scoped")
    await expect(page.locator("#scope")).toHaveText(sent ?? "")
    expect(await page.evaluate(async () => (await fetch("/scope")).text())).toBe(sent)
    expect(await (await page.request.get("/scope")).text()).toBe(sent)
    expect(await (await request.get("/scope")).text()).toBe(sent)
  })
}
