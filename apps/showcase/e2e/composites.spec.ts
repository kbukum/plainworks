import { expect, type Page, test } from "@playwright/test"
import { expectNoBrowserAxeViolations, expectReflowAtNarrowViewport } from "./axe"

async function openGallery(page: Page): Promise<void> {
  await page.route("**/composites-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="en"><head><title>Composite gallery</title></head><body><div id="fixture"></div><script type="module" src="/e2e/fixtures/composites.tsx"></script></body></html>',
    }),
  )
  await page.goto("/composites-fixture")
  await expect(page.getByRole("heading", { level: 1, name: "Composite gallery" })).toBeVisible({
    timeout: 30_000,
  })
}

test("composites meet contrast and target size in light and dark", async ({ page }) => {
  await openGallery(page)
  for (const dark of [false, true]) {
    await test.step(dark ? "dark" : "light", async () => {
      await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), dark)
      await expectNoBrowserAxeViolations(page)
    })
  }
})

test("composites reflow at 320 CSS px", async ({ page }) => {
  await openGallery(page)
  await expectReflowAtNarrowViewport(page)
})

test("a narrow table keeps low-priority values reachable through row details", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openGallery(page)

  await expect(page.getByRole("columnheader", { name: "Placed" })).toBeHidden()
  const disclosure = page.getByRole("button", { name: "Details for Ada Lovelace" })
  await expect(disclosure).toHaveAttribute("aria-expanded", "false")
  await disclosure.click()
  await expect(disclosure).toHaveAttribute("aria-expanded", "true")
  const details = page.locator(`#${await disclosure.getAttribute("aria-controls")}`)
  await expect(details.getByText("2024-05-01")).toBeVisible()
  await expect(details.getByText("EMEA")).toBeVisible()

  // Widening hides the details column; the table then closes the open detail, so each value is
  // back in its own column rather than stranded in a hidden detail row.
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(page.getByRole("columnheader", { name: "Placed" })).toBeVisible()
  await expect(disclosure).toBeHidden()
  await expect(page.getByRole("cell", { name: "2024-05-01" })).toBeVisible()
  await expect(details).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(disclosure).toHaveAttribute("aria-expanded", "false")
})

// Browser zoom shrinks the CSS viewport, so 200% zoom at 1280px is a 640 CSS px layout.
test("row information survives 200% zoom", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 })
  await openGallery(page)

  const disclosure = page.getByRole("button", { name: "Details for Grace Hopper" })
  await disclosure.click()
  const details = page.locator(`#${await disclosure.getAttribute("aria-controls")}`)
  await expect(details.getByText("AMER")).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
})

test("the filter bar keeps keyboard focus through add, remove, and clear", async ({ page }) => {
  await openGallery(page)
  const filters = page.getByRole("group", { name: "Filters" })

  await filters.getByRole("button", { name: "Add filter" }).click()
  await expect(
    filters.getByRole("group", { name: "Filter 2" }).getByRole("combobox", { name: "Field" }),
  ).toBeFocused()
  await expect(filters.getByRole("status")).toHaveText("2 filters applied")

  await filters.getByRole("button", { name: "Remove filter 2" }).click()
  await expect(
    filters.getByRole("group", { name: "Filter 1" }).getByRole("combobox", { name: "Field" }),
  ).toBeFocused()

  await filters.getByRole("button", { name: "Clear all filters" }).click()
  await expect(filters.getByRole("button", { name: "Add filter" })).toBeFocused()
  await expect(filters.getByRole("status")).toHaveText("No filters applied")
})
