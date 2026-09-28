import { defineFlow, type FlowCheckpoint } from "@plainworks/testkit/browser"
import { expect } from "@playwright/test"
import { appRoute, navigateTo, openRoute } from "../../support/app"

// A failed request logs this line in the console; the error state is the point of the checkpoint.
const FAILED_REQUEST = {
  check: "runtime",
  match: /status of 500/,
  reason: "The checkpoint fails the API on purpose to show the page's error state",
} as const

const FAILING_PAGES = [
  ["overview", "Revenue trend is unavailable"],
  ["tasks", "Tasks are unavailable"],
  ["orders", "Orders are unavailable"],
  ["products", "Products are unavailable"],
  ["users", "Users are unavailable"],
  ["settings-profile", "Settings are unavailable"],
] as const

// The server renders each page with its data, so a user meets a failure by navigating inside the
// app while the API fails. Each checkpoint starts on another page, then fails every request.
const failing = ([slug, title]: (typeof FAILING_PAGES)[number]): FlowCheckpoint => ({
  name: slug,
  act: async (page, { signal }) => {
    await page.unrouteAll({ behavior: "ignoreErrors" })
    await openRoute(page, appRoute(slug === "overview" ? "users" : "overview"), signal)
    await page.route("**/api/**", (request) =>
      request.fulfill({ status: 500, contentType: "application/json", body: '{"error":"boom"}' }),
    )
    await navigateTo(page, appRoute(slug), signal)
  },
  ready: (page) => page.getByText(title),
  allow: [FAILED_REQUEST],
})

/** Every data page when its API fails. */
export const failureFlow = defineFlow({
  name: "failure",
  covers: [
    "apps/showcase/e2e/flows/states/failure.ts",
    "apps/showcase/src/client/**",
    "packages/ui/src/client/{feedback,page}/**",
  ],
  checkpoints: [
    ...FAILING_PAGES.map(failing),
    {
      // The header's unread badge shares the notifications feed query, and every page prefetches
      // it, so that feed fails only when it never loads: the mock backend fails from the start.
      name: "notifications",
      act: async (page, { signal }) => {
        await page.unrouteAll({ behavior: "ignoreErrors" })
        const response = await page.request.post("/mock/error", { data: { enabled: true } })
        expect(response.ok()).toBe(true)
        await page.goto(appRoute("notifications").path, { signal })
      },
      ready: (page) => page.getByText("Notifications are unavailable"),
      allow: [FAILED_REQUEST],
    },
  ],
})
