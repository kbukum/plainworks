import { expect, type Page, test } from "@playwright/test"

const sections = [
  ["overview", "/"],
  ["tasks", "/tasks"],
  ["orders", "/orders"],
  ["products", "/products"],
  ["users", "/users"],
  ["notifications", "/notifications"],
  ["settings", "/settings"],
] as const

const viewports = [
  ["desktop", 1440, 1000],
  ["tablet", 900, 900],
  ["mobile", 390, 844],
] as const

async function signIn(page: Page): Promise<void> {
  await page.goto("/")
  const signInButton = page.getByRole("button", { name: "Sign in" })
  if (await signInButton.isVisible()) {
    await signInButton.click()
    await page.waitForLoadState("load")
  }
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible()
}

test("server markup is styled before client hydration", async ({ page }) => {
  await signIn(page)
  await page.route("**/src/client/entry-client.tsx", (route) => route.abort())

  await page.reload({ waitUntil: "domcontentloaded" })

  await expect(page.locator('link[rel="stylesheet"][href="/src/client/styles.css"]')).toHaveCount(1)
  await expect(page.locator("[data-mode]")).toHaveCSS("display", "grid")
  await expect(page.getByRole("banner")).toHaveCSS("position", "sticky")
})

test("sticky header does not obscure keyboard-focused controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 })
  await signIn(page)
  await page.goto("/users")
  await page.waitForLoadState("networkidle")
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))

  const search = page.getByRole("searchbox", { name: "Search users" })
  await search.focus()

  const headerBox = await page.getByRole("banner").boundingBox()
  const searchBox = await search.boundingBox()
  await expect(page.locator("html")).toHaveCSS("scroll-padding-top", "64px")
  expect(searchBox?.y ?? 0).toBeGreaterThanOrEqual((headerBox?.y ?? 0) + (headerBox?.height ?? 0))
})

test("low-priority table columns adapt visibility to container presentation", async ({ page }) => {
  await signIn(page)
  await page.goto("/tasks")
  await page.waitForLoadState("networkidle")

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole("columnheader", { name: "Priority" })).toBeHidden()

  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(page.getByRole("columnheader", { name: "Priority" })).toBeVisible()
})

test("every showcase section reflows without clipping", async ({ page }) => {
  test.setTimeout(120_000)
  for (const [viewport, width, height] of viewports) {
    await page.setViewportSize({ width, height })
    await signIn(page)

    for (const [section, path] of sections) {
      await page.goto(path)
      await page.waitForLoadState("networkidle")

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
            .filter((element) => element.scrollWidth > element.clientWidth + 1)
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
