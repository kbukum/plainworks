import { defineFlow } from "@plainworks/testkit/playwright"
import { expect, type Page } from "@playwright/test"
import { AUTH_USERNAME, authFixture, authScenario } from "./auth-host"

async function signIn(page: Page, signal: AbortSignal): Promise<void> {
  await page.getByLabel("Username").fill(AUTH_USERNAME, { signal })
  await page.getByLabel("Password").fill(authFixture().password, { signal })
  await page.getByRole("button", { name: "Sign in" }).click({ signal })
  await expect(page.getByLabel("auth-state")).toHaveText(/^authenticated/)
  await expect(page.getByLabel("Password")).toHaveValue("")
  await page.getByRole("button", { name: "Open events" }).click({ signal })
  await expect(page.getByLabel("events-state")).toHaveText(/status=open ready=true/)
}

export const authFlow = defineFlow({
  name: "opaque-session",
  covers: ["packages/auth/src/**", "packages/channel/src/**", "internal/integration/src/system/**"],
  checkpoints: [
    {
      name: "signed-out",
      frame: { kind: "full-page", hideFixed: [] },
      act: async (page, { signal }) => {
        await page.goto("/", { signal })
        await page.getByLabel("Username").focus()
      },
      ready: (page) => page.getByLabel("auth-state").filter({ hasText: /^unauthenticated/ }),
      checks: { hydration: false, focus: true },
    },
    {
      name: "signed-in",
      frame: { kind: "full-page", hideFixed: [] },
      act: (page, { signal }) => signIn(page, signal),
      ready: (page) =>
        page.getByLabel("events-state").filter({ hasText: /status=open ready=true/ }),
      checks: { hydration: false },
    },
    {
      name: "unconfirmed-logout",
      frame: { kind: "full-page", hideFixed: [] },
      act: async (page, { signal }) => {
        await authScenario(page.request, "unavailable-store")
        await page.getByRole("button", { name: "Sign out" }).click({ signal })
        await expect(page.getByLabel("logout-state")).toHaveText(/^unconfirmed=/)
        await expect(page.getByLabel("events-state")).toHaveText(/status=closed ready=false/)
      },
      ready: (page) => page.getByLabel("auth-state").filter({ hasText: /revocation=unconfirmed/ }),
      checks: { hydration: false },
      allow: [
        {
          check: "runtime",
          match: /Failed to load resource/,
          reason: "The real store is unavailable; local logout must not claim remote revocation.",
        },
      ],
    },
    {
      name: "recovered",
      frame: { kind: "full-page", hideFixed: [] },
      act: async (page, { signal }) => {
        await authScenario(page.request, "healthy-store")
        await signIn(page, signal)
      },
      ready: (page) =>
        page.getByLabel("events-state").filter({ hasText: /status=open ready=true/ }),
      checks: { hydration: false },
    },
    {
      name: "logged-out",
      frame: { kind: "full-page", hideFixed: [] },
      act: async (page, { signal }) => {
        await page.getByRole("button", { name: "Sign out" }).click({ signal })
        await expect(page.getByLabel("logout-state")).toHaveText("confirmed")
        await expect(page.getByLabel("events-state")).toHaveText(/status=closed ready=false/)
      },
      ready: (page) => page.getByLabel("auth-state").filter({ hasText: /revocation=confirmed/ }),
      checks: { hydration: false },
    },
  ],
})
