import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { expect } from "@playwright/test"
import { createBrowserGate } from "../../src/playwright/gate"

const data = process.env.GATE_DATA_DIR ?? ".gate"
const scenario = process.env.GATE_SCENARIO ?? "success"

const test = createBrowserGate({
  host: {
    command: ({ port }) => [
      process.execPath,
      join(import.meta.dirname, "host.mjs"),
      String(port),
      data,
    ],
    basePort: Number(process.env.GATE_BASE_PORT ?? "7600"),
    readyPath: "/ready",
    ready: async (response) => {
      const body = (await response.json()) as { runId?: unknown }
      return body.runId === `worker-${new URL(response.url).port}`
    },
    startTimeoutMs: scenario === "startup-cancel" ? 60_000 : 10_000,
    stopTimeoutMs: 2_000,
  },
  resetHost: async (request) => {
    const response = await request.post("/reset")
    if (!response.ok()) throw new Error(`reset failed: ${response.status()}`)
  },
  signIn: async (page) => {
    if (scenario === "sign-in-failure") throw new Error("sign-in refused")
    const response = await page.request.post("/sign-in")
    if (!response.ok()) throw new Error(`sign-in failed: ${response.status()}`)
    await page.goto("/")
  },
})

for (const index of [1, 2, 3, 4]) {
  test(`fresh signed-in context ${index}`, async ({ page, gateOrigin }) => {
    const port = new URL(gateOrigin ?? "").port
    expect(await page.evaluate(() => localStorage.getItem("previous-test"))).toBeNull()
    await page.evaluate(() => localStorage.setItem("previous-test", "seen"))
    const session = await page.request.get("/session")
    expect(await session.json()).toEqual({ runId: `worker-${port}` })
    if (scenario === "assertion-failure") expect(index).toBe(0)
    if (scenario === "timeout" || scenario === "cancel") {
      test.setTimeout(scenario === "timeout" ? 2_000 : 30_000)
      writeFileSync(join(data, "hanging"), port)
      await new Promise<never>(() => {})
    }
  })
}

test.describe("signed out", () => {
  test.use({ gateSignIn: false })
  test("starts without a session", async ({ page }) => {
    await page.goto("/")
    expect((await page.request.get("/session")).status()).toBe(401)
  })
})
