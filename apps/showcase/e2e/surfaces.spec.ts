import { expect, type Page, test } from "@playwright/test"
import { expectNoBrowserAxeViolations } from "./axe"
import { signIn } from "./session"

// The application-surface gate: the signed-out login page and every routed page, in both color
// schemes, must pass axe and render without a page error or console error (a hydration mismatch
// logs one). Every routed page keeps the header on a single row at 320 CSS px, and every page
// reflows without horizontal scroll at 320 px (400% zoom) and 640 px (200% zoom).

const ROUTES = [
  ["Overview", "/"],
  ["Tasks", "/tasks"],
  ["Orders", "/orders"],
  ["Products", "/products"],
  ["Users", "/users"],
  ["Notifications", "/notifications"],
  ["Settings", "/settings"],
] as const

/** Collect page errors and console errors for the lifetime of the page. */
function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  return errors
}

async function openRoute(page: Page, title: string, path: string): Promise<void> {
  await page.goto(path)
  await page.waitForLoadState("networkidle")
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible()
}

/** Land on the server-rendered login page the session gate redirects a guest to. */
async function openLogin(page: Page): Promise<void> {
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to plainworks" })).toBeVisible()
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

for (const scheme of ["light", "dark"] as const) {
  test(`every route passes axe with no runtime errors in ${scheme} mode`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.emulateMedia({ colorScheme: scheme })
    const errors = trackErrors(page)
    await openLogin(page)
    await expectNoBrowserAxeViolations(page)
    await signIn(page)
    const html = expect(page.locator("html"))
    await (scheme === "dark" ? html : html.not).toHaveClass(/\bdark\b/)

    for (const [title, path] of ROUTES) {
      await openRoute(page, title, path)
      await expectNoBrowserAxeViolations(page)
    }
    expect(errors).toEqual([])
  })
}

for (const width of [320, 640]) {
  test(`every route reflows at ${width} px with a single-row header`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width, height: 800 })
    await openLogin(page)
    expect(await horizontalOverflow(page), "/login horizontal overflow").toBeLessThanOrEqual(1)
    await signIn(page)

    for (const [title, path] of ROUTES) {
      await openRoute(page, title, path)
      expect(await horizontalOverflow(page), `${path} horizontal overflow`).toBeLessThanOrEqual(1)

      const header = await page.getByRole("banner").boundingBox()
      expect(header?.height ?? 0, `${path} header height`).toBeLessThanOrEqual(57)
    }
  })
}

test("a narrow catalog moves its filters into a drawer that reports the active count", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page)
  await openRoute(page, "Orders", "/orders")

  const trigger = page.getByRole("button", { name: /^Filters/ })
  await trigger.click()
  const drawer = page.getByRole("dialog", { name: "Order filters" })
  await expect(drawer).toBeVisible()
  await drawer.getByRole("checkbox").first().check()
  await page.keyboard.press("Escape")

  await expect(page.getByRole("button", { name: "Filters, 1 active" })).toBeFocused()
})
