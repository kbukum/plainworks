import {
  expectNoPageAxeViolations,
  expectPageFocusVisible,
  pressWithKeyboard,
} from "@plainworks/testkit/playwright"
import { expect, test } from "./support/gate"
import { hostRoute, openRoute, pauseLiveActivity } from "./support/host"

// The Next host as a user meets it: anonymous overview, sign-in through the BFF, the prefetched
// task list, the live feed, the account menu, and the color mode. Each page's axe, reflow, and
// focus checks run in the flows (`e2e/flows/`).

test.describe("signed out", () => {
  test.use({ gateSignIn: false })

  test("the public overview offers sign-in, which lands on the gated tasks", async ({ page }) => {
    await openRoute(page, hostRoute("overview"))
    await expectNoPageAxeViolations(page)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible()
    await expect(page.getByRole("button", { name: /Signed in as/ })).toBeVisible()
  })

  test("a callback without its login cookie recovers instead of failing", async ({ page }) => {
    // Sign-in begun on another origin, or left open past the cookie's lifetime, arrives like this.
    await page.goto("/auth/callback?code=stale&state=stale")
    await expect(page).toHaveURL(/\/auth\/interrupted$/)
    await expect(page.getByRole("heading", { level: 1, name: "Sign-in interrupted" })).toBeVisible()
    await page.getByRole("link", { name: "Sign in again" }).click()
    await expect(page.getByRole("button", { name: /Signed in as/ })).toBeVisible()
  })

  test("a gated page routes a guest through sign-in and back", async ({ page }) => {
    await page.goto("/account")
    await expect(page).toHaveURL(/\/account$/)
    await expect(page.getByRole("heading", { level: 1, name: "Account settings" })).toBeVisible()
  })
})

test("tasks hydrate from the server prefetch without refetching", async ({ page }) => {
  const taskReads: string[] = []
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/tasks") taskReads.push(request.url())
  })
  await openRoute(page, hostRoute("tasks"))
  await expect(
    page.getByRole("table", { name: "Tasks, highest priority first" }).getByRole("row"),
  ).not.toHaveCount(0)
  expect(taskReads).toEqual([])
})

test("the live feed streams updates and pausing silences it", async ({ page }) => {
  await page.goto("/")
  const feed = page.getByRole("list").filter({ hasText: /#\d+$/ })
  await expect(feed.getByRole("listitem").first()).toBeVisible({ timeout: 10_000 })
  await page.getByRole("button", { name: "Pause updates" }).click()
  const frozen = await feed.textContent()
  await page.waitForTimeout(3_000)
  await expect(feed).toHaveText(frozen ?? "")
  await expect(feed.locator("xpath=..")).toHaveAttribute("aria-live", "off")
})

test("the account menu opens account settings and logs out", async ({ page }) => {
  await openRoute(page, hostRoute("overview"))
  await pressWithKeyboard(page.getByRole("button", { name: /Signed in as/ }))
  await expectPageFocusVisible(page)
  await page.getByRole("menuitem", { name: "Account settings" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Account settings" })).toBeVisible()
  await expect(page.getByRole("main").getByText("Ada Lovelace")).toBeVisible()
  await page.getByRole("button", { name: /Signed in as/ }).click()
  await page.getByRole("menuitem", { name: "Log out" }).click()
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
})

test("the chosen color mode applies and survives a reload", async ({ page }) => {
  await openRoute(page, hostRoute("overview"))
  await page.getByRole("button", { name: /color mode/i }).click()
  await page.getByRole("menuitemradio", { name: "Dark" }).click()
  await expect(page.locator("html")).toHaveClass(/\bdark\b/)
  await page.reload()
  await expect(page.locator("html")).toHaveClass(/\bdark\b/)
  await pauseLiveActivity(page)
  await expectNoPageAxeViolations(page)
})

test("a narrow screen reaches every section from the sections menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openRoute(page, hostRoute("overview"))
  await page.getByRole("button", { name: "Open sections menu" }).click()
  const sections = page.getByRole("dialog", { name: "Sections" })
  await sections.getByRole("link", { name: "Tasks" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible()
  await expect(sections).toBeHidden()
})

test("the development inspector opens over the page and closes on Escape", async ({ page }) => {
  await openRoute(page, hostRoute("tasks"))
  await page
    .getByRole("region", { name: "Plainworks devtools" })
    .getByRole("button", { name: "Inspect" })
    .click()
  const inspector = page.getByRole("region", { name: "Plainworks inspector" })
  await expect(inspector).toBeVisible()
  await expectNoPageAxeViolations(page)
  await page.keyboard.press("Escape")
  await expect(inspector).toBeHidden()
})
