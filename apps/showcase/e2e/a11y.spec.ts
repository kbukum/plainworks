import { expect, type Page, test } from "@playwright/test"
import { expectNoBrowserAxeViolations, expectReflowAtNarrowViewport } from "./axe"

// A browser accessibility gate over the reference showcase's real authenticated flow: the session
// gate lands the user on the overview, then client-side navigation reaches the query-driven task
// view. Each rendered state is scanned with axe-core for the layout-dependent rules jsdom cannot
// measure (color contrast, 24x24 target size), and the flow is re-checked under dark mode and
// reduced motion so those preferences are honored, not just the default paint.

/**
 * Follow the session gate to the authenticated overview. An unauthenticated request to `/` is
 * bounced through the in-process mock IdP login chain and back, so a plain navigation lands signed
 * in with no test-only shortcut.
 */
async function signIn(page: Page): Promise<void> {
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible()
}

/** Open the query-driven task list through the app's own client-side navigation. */
async function openTasks(page: Page): Promise<void> {
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Tasks" })
    .click()
  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible()
}

test("skip link bypasses persistent navigation to main landmark", async ({ page }) => {
  await signIn(page)
  await page.keyboard.press("Tab")
  const skipLink = page.getByRole("link", { name: "Skip to main content" })
  await expect(skipLink).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page.locator("#main-content")).toBeFocused()
})

test("authenticated flow has no contrast or target-size violations", async ({ page }) => {
  await signIn(page)
  await expectNoBrowserAxeViolations(page)

  await openTasks(page)
  await expectNoBrowserAxeViolations(page)
})

test("task view reflows at a 320px viewport without horizontal scrolling", async ({ page }) => {
  await signIn(page)
  await openTasks(page)
  await expectReflowAtNarrowViewport(page)
})

test("flow stays accessible under dark mode and reduced motion", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })

  await signIn(page)
  await expect(page.locator("html")).toHaveClass(/\bdark\b/)
  await expectNoBrowserAxeViolations(page)

  await openTasks(page)
  await expectNoBrowserAxeViolations(page)
})
