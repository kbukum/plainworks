import { horizontalOverflow } from "@plainworks/testkit/browser"
import { APP_ROUTES, appRoute, navigateTo, openRoute } from "./support/app"
import { expect, test } from "./support/gate"

// The app shell's behavior across routes and widths: the header, the sections drawer, the account
// menu, the color-mode menu, and toasts. Their looks are in the visual specs.

for (const width of [320, 640]) {
  test(`every route keeps a single-row header and no side scroll at ${width} px`, async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width, height: 800 })
    for (const route of APP_ROUTES) {
      await openRoute(page, route)
      expect(
        await horizontalOverflow(page),
        `${route.path} horizontal overflow`,
      ).toBeLessThanOrEqual(1)
      const header = await page.getByRole("banner").boundingBox()
      expect(header?.height ?? 0, `${route.path} header height`).toBeLessThanOrEqual(57)
    }
  })
}

test("the sections drawer navigates on a narrow screen and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openRoute(page, appRoute("overview"))
  const open = page.getByRole("button", { name: "Open sections menu" })
  await open.click()
  const drawer = page.getByRole("navigation", { name: "Sections" })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  )
  await page.keyboard.press("Escape")
  await expect(drawer).toBeHidden()
  await expect(open).toBeFocused()

  await navigateTo(page, appRoute("orders"))
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible()
  await expect(drawer).toBeHidden()
})

test("the account menu names the user and opens account settings", async ({ page }) => {
  await openRoute(page, appRoute("overview"))
  await page.getByRole("button", { name: /Signed in as/ }).click()
  const menu = page.getByRole("menu")
  await expect(menu.getByRole("menuitem", { name: "Log out" })).toBeVisible()
  await menu.getByRole("menuitem", { name: "Account settings" }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByLabel("Display name")).toBeVisible()
})

test("the header color-mode menu switches the page to dark and back", async ({ page }) => {
  await openRoute(page, appRoute("overview"))
  const trigger = page.getByRole("button", { name: /^Color mode/ })
  await trigger.click()
  await page.getByRole("menuitemradio", { name: "Dark" }).click()
  await expect(page.locator("html")).toHaveClass(/\bdark\b/)
  await expect(trigger).toBeFocused()

  await trigger.click()
  await page.getByRole("menuitemradio", { name: "Light" }).click()
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/)
})

test("the revenue range control redraws the trend for the chosen range", async ({ page }) => {
  await openRoute(page, appRoute("overview"))
  const range = page.getByRole("group", { name: "Revenue date range" })
  const trend = page.getByRole("figure", { name: /over the period/ })
  const before = (await trend.textContent()) ?? ""
  const last90 = range.getByRole("button", { name: "Last 90 days" })
  await last90.click()
  await expect(last90).toHaveAttribute("aria-pressed", "true")
  await expect(range.getByRole("button", { name: "Last 7 days" })).toHaveAttribute(
    "aria-pressed",
    "false",
  )
  await expect(trend).not.toHaveText(before)
})

test("a toast announces an action and dismisses itself", async ({ page }) => {
  await openRoute(page, appRoute("notifications"))
  await page
    .getByRole("button", { name: /^Mark read/ })
    .first()
    .click()
  const toast = page.getByText("Marked as read")
  await expect(toast).toBeVisible()
  await expect(toast).toBeHidden({ timeout: 10_000 })
})

test("a narrow catalog moves its filters into a drawer that reports the active count", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openRoute(page, appRoute("orders"))

  const trigger = page.getByRole("button", { name: /^Filters/ })
  await trigger.click()
  const drawer = page.getByRole("dialog", { name: "Order filters" })
  await expect(drawer).toBeVisible()
  await drawer.getByRole("checkbox").first().check()
  await page.keyboard.press("Escape")

  await expect(page.getByRole("button", { name: "Filters, 1 active" })).toBeFocused()
})
