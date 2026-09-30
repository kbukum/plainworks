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

test("system mode paints dark on a dark OS before hydration, with no class change after", async ({
  page,
  runtimeErrors,
}) => {
  runtimeErrors.allow(/Failed to load resource: net::ERR_FAILED/)
  await page.emulateMedia({ colorScheme: "dark" })
  await signIn(page)
  const rootTheme = () =>
    page.locator("html").evaluate((root) => ({
      className: root.className,
      scheme: getComputedStyle(root).colorScheme,
    }))

  await page.route("**/src/client/entry-client.tsx", (route) => route.abort())
  await page.reload({ waitUntil: "load" })
  const serverPaint = await rootTheme()
  expect(serverPaint).toEqual({ className: "theme-indigo", scheme: "dark" })

  await page.unroute("**/src/client/entry-client.tsx")
  await openRoute(page, appRoute("overview"))
  expect(await rootTheme()).toEqual(serverPaint)
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

// One test per viewport keeps each route sweep inside its own budget and lets them run in parallel.
for (const [viewport, width, height] of viewports) {
  test(`every showcase section reflows without clipping at ${viewport}`, async ({ page }) => {
    test.setTimeout(90_000)
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
  })
}

test("task dialog keeps its actions in view on a short landscape screen", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await openPausedTasks(page)
  await page.getByRole("button", { name: "New task" }).click()
  const dialog = page.getByRole("dialog", { name: "New task" })

  const body = dialog.locator("[data-slot='modal-body']")
  const scrolls = await body.evaluate((element) => element.scrollHeight > element.clientHeight)
  expect(scrolls, "the form overflows the short screen").toBe(true)
  for (const name of ["Cancel", "Create task"]) {
    await expect(dialog.getByRole("button", { name })).toBeInViewport({ ratio: 1 })
  }

  // Tabbing down the form scrolls each field fully above the pinned actions, never under them.
  const actionsTop = await dialog
    .getByRole("button", { name: "Cancel" })
    .evaluate((button) => button.parentElement?.getBoundingClientRect().top ?? 0)
  for (let stop = 0; stop < 6; stop++) {
    await page.keyboard.press("Tab")
    const focused = await page.evaluate(() => {
      const active = document.activeElement
      return active === null
        ? null
        : { name: active.textContent ?? "", bottom: active.getBoundingClientRect().bottom }
    })
    if (focused === null || /Cancel|Create task/.test(focused.name)) break
    expect(focused.bottom, `${focused.name} clears the actions`).toBeLessThanOrEqual(actionsTop)
  }
})

for (const [side, width, height] of [
  ["bottom", 1440, 900],
  ["bottom", 390, 844],
  ["right", 1440, 900],
] as const) {
  test(`toasts clear the devtools docked ${side} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    if (side !== "bottom") {
      await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
        "plainworks-devtools-layout",
        JSON.stringify({ side }),
      ] as const)
    }
    await openRoute(page, appRoute("notifications"))
    const devtools = page.getByRole("region", { name: "Plainworks devtools" })
    await expect(devtools).toHaveAttribute("data-dock", side)

    await page
      .getByRole("button", { name: /^Mark read/ })
      .first()
      .click()
    const toast = page.getByRole("dialog").filter({ hasText: "Marked as read" })
    await expect(toast).toBeInViewport({ ratio: 1 })

    const [toastBox, barBox] = await Promise.all([toast.boundingBox(), devtools.boundingBox()])
    if (toastBox === null || barBox === null) throw new Error("expected the toast and the bar")
    const overlaps =
      toastBox.x < barBox.x + barBox.width &&
      barBox.x < toastBox.x + toastBox.width &&
      toastBox.y < barBox.y + barBox.height &&
      barBox.y < toastBox.y + toastBox.height
    expect(overlaps, "the toast sits clear of the devtools bar").toBe(false)
  })
}
