import { startGateHost } from "@plainworks/testkit/playwright"
import { expect, test } from "@playwright/test"
import { publicHost } from "./public-host"

test("untrusted HTTPS is rejected by readiness and the actual browser", async ({ browser }) => {
  const config = publicHost(true)
  const started = startGateHost(config, config.basePort).then(
    async (host) => {
      await host.stop()
      return { ready: true, error: undefined }
    },
    (error: unknown) => ({ ready: false, error }),
  )
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await expect
      .poll(
        async () => {
          try {
            await page.goto(`https://127.0.0.1:${config.basePort}`, { timeout: 500 })
            return "Unexpectedly trusted"
          } catch (error) {
            if (!(error instanceof Error)) throw error
            return error.message
          }
        },
        { timeout: 1_000, intervals: [50] },
      )
      .toMatch(/ERR_CERT_AUTHORITY_INVALID/)
    const result = await started
    expect(result.ready).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
  } finally {
    await context.close()
    await started
  }
})
