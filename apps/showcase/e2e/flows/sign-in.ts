import { defineFlow } from "@plainworks/testkit/browser"

/**
 * A guest's way in: the login page, a sign-in that could not finish, and signing in again. The
 * server renders both sign-in pages as static markup with no client bundle to hydrate.
 */
export const signInFlow = defineFlow({
  name: "sign-in",
  covers: [
    "apps/showcase/e2e/flows/sign-in.ts",
    "apps/showcase/src/server/**",
    "apps/showcase/src/app/auth.ts",
    "packages/auth/src/**",
  ],
  checkpoints: [
    {
      name: "login",
      act: async (page, { signal }) => {
        await page.context().clearCookies()
        await page.goto("/", { signal })
      },
      ready: (page) => page.getByRole("heading", { level: 1, name: "Sign in to plainworks" }),
      checks: { hydration: false },
    },
    {
      name: "interrupted",
      // Sign-in begun on another origin, or left open past the cookie's lifetime, arrives like
      // this.
      act: (page, { signal }) => page.goto("/auth/callback?code=stale&state=stale", { signal }),
      ready: (page) => page.getByRole("alert").filter({ hasText: "Sign-in didn't finish" }),
      checks: { hydration: false },
    },
    {
      name: "signed-in",
      act: (page, { signal }) => page.getByRole("button", { name: "Sign in" }).click({ signal }),
      ready: (page) => page.getByRole("button", { name: /Signed in as/ }),
    },
  ],
})
