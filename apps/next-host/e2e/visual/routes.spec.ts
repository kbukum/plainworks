import {
  COMPACT_MATRIX,
  FULL_MATRIX,
  planVisualTests,
  pressWithKeyboard,
  runVisualTest,
  VISUAL_TAG,
  type VisualMatrix,
  type VisualSurface,
} from "@plainworks/testkit/browser"
import type { Page } from "@playwright/test"
import { expect, test } from "../support/gate"
import { HOST_ROUTES, hostRoute, openStillRoute, PAGE_CAPTURE } from "../support/host"
import { SIGNED_OUT_STATE } from "../support/session"

// Every Next host page and overlay as a user sees it, held still before the live stream's first
// frame. Pages capture in light and dark at every gate viewport; overlays at desktop and mobile.

// The Next host registers the HTTP and channel sources, so its inspector covers the channel panel
// the showcase lacks.
const INSPECTOR_TABS = ["Overview", "Timeline", "http", "channel"] as const

const MOBILE_ONLY: VisualMatrix = { modes: COMPACT_MATRIX.modes, viewports: ["mobile"] }

// Each page captures whole; its `-viewport` twin shows the first screen with the devtools bar where
// a user sees it, and skips the checks the full-page surface already ran.
const pages: readonly VisualSurface[] = HOST_ROUTES.flatMap((route) => [
  {
    name: route.slug,
    matrix: FULL_MATRIX,
    holdsClock: true,
    capture: PAGE_CAPTURE,
    arrange: (page) => openStillRoute(page, route),
  },
  {
    name: `${route.slug}-viewport`,
    matrix: COMPACT_MATRIX,
    holdsClock: true,
    checks: { axe: false, overflow: false },
    arrange: (page) => openStillRoute(page, route),
  },
])

const overlays: readonly VisualSurface[] = [
  {
    name: "account-menu",
    matrix: COMPACT_MATRIX,
    holdsClock: true,
    checks: { focus: true },
    arrange: (page: Page) =>
      openStillRoute(page, hostRoute("overview"), async (page) => {
        await pressWithKeyboard(page.getByRole("button", { name: /Signed in as/ }))
        await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible()
      }),
  },
  {
    name: "color-mode-menu",
    matrix: COMPACT_MATRIX,
    holdsClock: true,
    checks: { focus: true },
    arrange: (page: Page) =>
      openStillRoute(page, hostRoute("overview"), async (page) => {
        await pressWithKeyboard(page.getByRole("button", { name: /color mode/i }))
        await expect(page.getByRole("menuitemradio", { name: "Dark" })).toBeVisible()
      }),
  },
  {
    name: "sections-drawer",
    matrix: MOBILE_ONLY,
    holdsClock: true,
    checks: { focus: true },
    arrange: (page: Page) =>
      openStillRoute(page, hostRoute("tasks"), async (page) => {
        await pressWithKeyboard(page.getByRole("button", { name: "Open sections menu" }))
        const drawer = page.getByRole("dialog", { name: "Sections" })
        await expect(drawer).toBeVisible()
        // The drawer drops its entry offset on the next animation frame, which the held clock runs
        // only when told; its slide then finishes on the compositor.
        await page.clock.runFor(100)
        await expect.poll(async () => (await drawer.boundingBox())?.x).toBe(0)
      }),
  },
  ...INSPECTOR_TABS.map((tab) => ({
    name: `inspector-${tab.toLowerCase()}`,
    matrix: COMPACT_MATRIX,
    holdsClock: true,
    arrange: (page: Page) =>
      openStillRoute(page, hostRoute("tasks"), async (page) => {
        await page
          .getByRole("region", { name: "Plainworks devtools" })
          .getByRole("button", { name: "Inspect" })
          .click()
        const inspector = page.getByRole("region", { name: "Plainworks inspector" })
        const trigger = inspector.getByRole("tab", { name: tab, exact: true })
        await trigger.click()
        await expect(trigger).toHaveAttribute("aria-selected", "true")
      }),
  })),
]

for (const planned of planVisualTests([...pages, ...overlays])) {
  test(planned.title, { tag: VISUAL_TAG }, ({ page, runtimeErrors }) =>
    runVisualTest({ page, runtimeErrors }, planned),
  )
}

test.describe("signed out", () => {
  test.use({ storageState: SIGNED_OUT_STATE })
  const guestOverview: VisualSurface = {
    name: "overview-guest",
    matrix: FULL_MATRIX,
    holdsClock: true,
    capture: PAGE_CAPTURE,
    arrange: (page) => openStillRoute(page, hostRoute("overview")),
  }
  for (const planned of planVisualTests([guestOverview])) {
    test(planned.title, { tag: VISUAL_TAG }, ({ page, runtimeErrors }) =>
      runVisualTest({ page, runtimeErrors }, planned),
    )
  }
})
