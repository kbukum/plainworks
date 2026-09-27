import {
  COMPACT_MATRIX,
  FULL_MATRIX,
  planVisualTests,
  runVisualTest,
  VISUAL_TAG,
  type VisualSurface,
} from "@plainworks/testkit/browser"
import type { Page } from "@playwright/test"
import { APP_ROUTES, type AppRoute, openPausedTasks, openRoute, PAGE_CAPTURE } from "../support/app"
import { expect, test } from "../support/gate"
import { SIGNED_OUT_STATE } from "../support/session"

// Every page as a user first sees it, in light and dark at every gate viewport, captured whole.
// Each `-viewport` twin shows the first screen with the devtools bar docked where a user sees it;
// it repeats the same state, so it skips the checks its full-page surface already ran.

const arrangeRoute = (route: AppRoute) => (page: Page) =>
  route.slug === "tasks" ? openPausedTasks(page) : openRoute(page, route)

const routeSurfaces: readonly VisualSurface[] = APP_ROUTES.flatMap((route) => [
  { name: route.slug, matrix: FULL_MATRIX, capture: PAGE_CAPTURE, arrange: arrangeRoute(route) },
  {
    name: `${route.slug}-viewport`,
    matrix: COMPACT_MATRIX,
    checks: { axe: false, overflow: false },
    arrange: arrangeRoute(route),
  },
])

for (const planned of planVisualTests(routeSurfaces)) {
  test(planned.title, { tag: VISUAL_TAG }, ({ page, runtimeErrors }) =>
    runVisualTest({ page, runtimeErrors }, planned),
  )
}

const loginSurface: VisualSurface = {
  name: "login",
  matrix: FULL_MATRIX,
  capture: PAGE_CAPTURE,
  // The server renders the login page as static markup with no client bundle to hydrate.
  checks: { hydration: false },
  arrange: async (page) => {
    await page.goto("/")
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign in to plainworks" }),
    ).toBeVisible()
  },
}

// The login page after a sign-in that could not finish, with its notice above the action.
const loginInterruptedSurface: VisualSurface = {
  name: "login-interrupted",
  matrix: COMPACT_MATRIX,
  checks: { hydration: false },
  arrange: async (page) => {
    await page.goto("/auth/callback?code=stale&state=stale")
    await expect(page.getByRole("alert")).toContainText("Sign-in didn't finish")
  },
}

test.describe("signed out", () => {
  test.use({ storageState: SIGNED_OUT_STATE })
  for (const planned of planVisualTests([loginSurface, loginInterruptedSurface])) {
    test(planned.title, { tag: VISUAL_TAG }, ({ page, runtimeErrors }) =>
      runVisualTest({ page, runtimeErrors }, planned),
    )
  }
})
