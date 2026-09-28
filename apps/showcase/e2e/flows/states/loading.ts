import { defineFlow, type FlowCheckpoint } from "@plainworks/testkit/browser"
import { expect } from "@playwright/test"
import { appRoute, navigateTo, openRoute } from "../../support/app"

const LOADING_PAGES = [
  "overview",
  "tasks",
  "orders",
  "products",
  "users",
  "notifications",
  "settings-profile",
] as const

// The server renders each page with its data, so a user meets loading only by navigating inside
// the app while the API is slow. Each checkpoint starts on another page, then hangs every request.
const loading = (slug: (typeof LOADING_PAGES)[number]): FlowCheckpoint => ({
  name: slug,
  act: async (page, { signal }) => {
    const route = appRoute(slug)
    await page.unrouteAll({ behavior: "ignoreErrors" })
    await openRoute(page, appRoute(slug === "overview" ? "users" : "overview"), signal)
    await page.route("**/api/**", () => undefined)
    await navigateTo(page, route, signal)
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible()
  },
  ready: (page) => page.getByRole("status", { name: /^Loading/ }).first(),
})

/** Every data page while its data is still on the way. */
export const loadingFlow = defineFlow({
  name: "loading",
  covers: [
    "apps/showcase/e2e/flows/states/loading.ts",
    "apps/showcase/src/client/**",
    "packages/ui/src/client/{feedback,page,data-table,list}/**",
  ],
  checkpoints: LOADING_PAGES.map(loading),
})
