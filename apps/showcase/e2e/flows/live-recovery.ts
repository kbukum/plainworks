import { ProfileInputSchema } from "@plainworks/testkit/connect"
import { defineFlow } from "@plainworks/testkit/playwright"
import { expect } from "@playwright/test"
import { PAGE_FRAME } from "./frame"

const epoch = "00000000000000000000000000000001"

export const liveRecoveryFlow = defineFlow({
  name: "live-recovery",
  covers: ["packages/{std,channel,query,http,mocks}/src/**", "apps/showcase/e2e/fixtures/live*"],
  checkpoints: [
    {
      name: "remote-cache-reset",
      act: async (page) => {
        let reads = 0
        await page.route("**/live-snapshot", (route) =>
          route.fulfill({ json: `Current snapshot ${++reads}` }),
        )
        await page.route("**/live-stream?*", async (route) => {
          const mode = new URL(route.request().url()).searchParams.get("mode")
          const cursor = `${epoch}:${mode === "initial" ? 1 : 2}`
          let wire = `event: connected\ndata: ${JSON.stringify({ epoch, cursor })}\n\n`
          if (mode === "reset") {
            expect(route.request().headers()["last-event-id"]).toBe(`${epoch}:1`)
            const reset = `event: reset\ndata: ${JSON.stringify({ reason: "replayExpired", cursor })}\n\n`
            wire = reset + reset + wire
          }
          const app = `id: ${cursor}\nevent: ${ProfileInputSchema.typeName}\ndata: {"label":"changed"}\n\n`
          wire += app + app
          if (mode === "auth")
            wire =
              'event: failure\ndata: {"code":"TOKEN_EXPIRED","message":"Sign in","retryable":false}\n\n'
          await route.fulfill({ contentType: "text/event-stream", body: wire })
        })
        await page.goto("/e2e/fixtures/live.html")
        await expect(page.getByText("Current snapshot 1")).toBeVisible()
        await expect(page.getByLabel("Synchronization")).toHaveText("fresh")
        await page.getByRole("button", { name: "Reconnect after reset" }).click()
        await expect(page.getByText("Current snapshot 2")).toBeVisible()
        await expect(page.getByLabel("Synchronization")).toHaveText("fresh")
        expect(reads).toBe(2)
      },
      ready: (page) => page.getByText("Current snapshot 2"),
      frame: PAGE_FRAME,
    },
    {
      name: "terminal-session",
      act: async (page) => {
        await page.getByRole("button", { name: "Expired session" }).click()
        await expect(page.getByRole("alert")).toHaveText("Sign in to continue")
        await expect(page.getByLabel("Synchronization")).toHaveText("closed")
      },
      ready: (page) => page.getByRole("alert"),
      frame: PAGE_FRAME,
    },
  ],
})
