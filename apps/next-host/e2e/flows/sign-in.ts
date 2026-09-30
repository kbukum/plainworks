import { defineFlow } from "@plainworks/testkit/playwright"
import { hostRoute, openRoute } from "../support/host"

/** A guest's public overview, then signing in through the BFF, which lands on the gated tasks. */
export const signInFlow = defineFlow({
  name: "sign-in",
  covers: [
    "apps/next-host/e2e/flows/sign-in.ts",
    "apps/next-host/src/app/**",
    "packages/auth/src/**",
  ],
  checkpoints: [
    {
      name: "guest-overview",
      act: async (page, { signal }) => {
        await page.context().clearCookies()
        await openRoute(page, hostRoute("overview"), signal)
      },
      ready: (page) => page.getByRole("button", { name: "Sign in" }),
    },
    {
      name: "signed-in",
      act: (page, { signal }) => page.getByRole("button", { name: "Sign in" }).click({ signal }),
      ready: (page) => page.getByRole("button", { name: /Signed in as/ }),
    },
  ],
})
