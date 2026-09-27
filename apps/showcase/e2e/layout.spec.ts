import { APP_ROUTES, appRoute, openPausedTasks, openRoute } from "./support/app"
import { expect, test } from "./support/gate"
import { signIn } from "./support/session"

const viewports = [
  ["desktop", 1440, 900],
  ["tablet", 768, 1024],
  ["mobile", 390, 844],
] as const

test("server markup is styled before client hydration", async ({ page, runtimeErrors }) => {
  runtimeErrors.allow(/Failed to load resource: net::ERR_FAILED/)
  await signIn(page)
  await page.route("**/src/client/entry-client.tsx", (route) => route.abort())

  await page.reload({ waitUntil: "domcontentloaded" })

  await expect(page.locator('link[rel="stylesheet"][href="/src/client/styles.css"]')).toHaveCount(1)
  await expect(page.locator("[data-slot='app-shell']")).toHaveCSS("display", "grid")
  await expect(page.getByRole("banner")).toHaveCSS("position", "sticky")
})

test("sticky header does not obscure keyboard-focused controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 })
  await openRoute(page, appRoute("users"))
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))

  const search = page.getByRole("searchbox", { name: "Search users" })
  await search.focus()

  const headerBox = await page.getByRole("banner").boundingBox()
  const searchBox = await search.boundingBox()
  await expect(page.locator("html")).toHaveCSS("scroll-padding-top", "64px")
  expect(searchBox?.y ?? 0).toBeGreaterThanOrEqual((headerBox?.y ?? 0) + (headerBox?.height ?? 0))
})

test("low-priority table columns adapt visibility to container presentation", async ({ page }) => {
  await openPausedTasks(page)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole("columnheader", { name: "Priority" })).toBeHidden()
  await expect(page.getByRole("columnheader", { name: "Due" })).toBeHidden()
  const disclosure = page.getByRole("button", { name: /^Details for / }).first()
  await disclosure.click()
  await expect(disclosure).toHaveAttribute("aria-expanded", "true")
  const details = page.locator(`#${await disclosure.getAttribute("aria-controls")}`)
  await expect(details.getByText("Priority")).toBeVisible()
  await expect(details.getByText("Due")).toBeVisible()

  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(page.getByRole("columnheader", { name: "Priority" })).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "Due" })).toBeVisible()
})

test("every showcase section reflows without clipping", async ({ page }) => {
  test.setTimeout(120_000)
  for (const [viewport, width, height] of viewports) {
    await page.setViewportSize({ width, height })
    for (const route of APP_ROUTES) {
      const section = route.slug
      await openRoute(page, route)

      const overflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }))
      expect(overflow.documentWidth, `${viewport}/${section} document width`).toBeLessThanOrEqual(
        overflow.viewportWidth,
      )

      const clippedSurfaces = await page
        .locator('[data-slot="table-container"], fieldset > div, nav[aria-label="Pagination"]')
        .evaluateAll((elements) =>
          elements
            // Only a box that clips or scrolls hides content; visible overflow (a switch's
            // enlarged hit area) shows up in the document width instead.
            .filter(
              (element) =>
                getComputedStyle(element).overflowX !== "visible" &&
                element.scrollWidth > element.clientWidth + 1,
            )
            .map((element) => ({
              slot: element.getAttribute("data-slot"),
              text: element.textContent?.trim().slice(0, 80),
            })),
        )
      expect(clippedSurfaces, `${viewport}/${section} clipped surfaces`).toEqual([])

      if (width >= 768) {
        const rail = page.getByRole("navigation", { name: "Primary" }).locator("..")
        const railBox = await rail.boundingBox()
        expect(railBox?.y ?? 0).toBeGreaterThan(0)
        expect((railBox?.y ?? 0) + (railBox?.height ?? 0)).toBeGreaterThanOrEqual(height)
      }
    }
  }
})
