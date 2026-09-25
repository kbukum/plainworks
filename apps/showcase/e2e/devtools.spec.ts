import { expect, type Page, test } from "@playwright/test"
import { expectNoBrowserAxeViolations, expectReflowAtNarrowViewport } from "./axe"
import { signIn } from "./session"

async function openFixture(page: Page): Promise<void> {
  await page.route("**/inspector-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="en"><head><title>Inspector consumer</title></head><body><div id="fixture"></div><script type="module" src="/e2e/fixtures/inspector.tsx"></script></body></html>',
    }),
  )
  await page.goto("/inspector-fixture")
  await expect(page.getByRole("button", { name: "Open Plainworks inspector" })).toBeVisible()
}

test("consumer discovers instances, isolates failure, reports overflow, and cleans up", async ({
  page,
}) => {
  await openFixture(page)
  await expectReflowAtNarrowViewport(page)
  await expectNoBrowserAxeViolations(page)
  const rail = page.getByRole("region", { name: "Diagnostics" })
  await rail.getByRole("button", { name: "Show 1 more diagnostic" }).click()
  const discovery = page.getByRole("dialog", { name: "Plainworks inspector" })
  await expect(discovery.getByRole("list", { name: "Sources" }).getByRole("listitem")).toHaveCount(
    2,
  )
  await page.keyboard.press("Escape")
  await rail.getByRole("button", { name: "Cache health: degraded" }).click()
  const panel = page.getByRole("dialog", { name: "Plainworks inspector" })
  await expect(panel.getByRole("tab", { name: "fixture", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  )
  await expect(panel.getByText("Primary ready", { exact: true })).toBeVisible()
  await panel.getByRole("combobox", { name: "Instance" }).click()
  await page.getByRole("option", { name: "Secondary cache" }).click()
  await expect(panel.getByText("Secondary ready", { exact: true })).toBeVisible()
  await expect(panel.getByText("Primary ready", { exact: true })).toBeHidden()
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "Fail primary source" }).click()
  await rail.getByRole("button", { name: "Primary cache: Failed" }).click()
  await panel.getByRole("combobox", { name: "Instance" }).click()
  await page.getByRole("option", { name: "Primary cache" }).click()
  await expect(panel.getByRole("alert")).toContainText("Fixture source unavailable")
  await panel.getByRole("tab", { name: "fixture", exact: true }).click()
  await panel.getByRole("combobox", { name: "Instance" }).click()
  await page.getByRole("option", { name: "Secondary cache" }).click()
  await expect(panel.getByText("Secondary ready", { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "Emit burst" }).click()
  await rail.getByRole("button", { name: /Timeline: .* dropped/ }).click()
  await expect(panel.getByRole("tab", { name: "Timeline" })).toHaveAttribute(
    "aria-selected",
    "true",
  )
  await expect(panel.getByRole("list", { name: "Events" }).getByRole("listitem")).toHaveCount(500)
  await panel.getByRole("button", { name: "Pause", exact: true }).click()
  await panel.getByRole("button", { name: "Resume", exact: true }).click()
  await expect(panel.getByRole("list", { name: "Events" }).getByRole("listitem")).toHaveCount(3)
  await panel.getByRole("tab", { name: "Overview" }).click()
  await expect(panel.getByText(/events dropped — retention is bounded/)).toBeVisible()
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "Dispose inspector" }).click()
  await expect(page.getByRole("status")).toHaveText("Disposed 2 sources")
  await expect(rail).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Open Plainworks inspector" })).toHaveCount(0)
  await expect(page.locator("body")).toHaveCSS("padding-bottom", "0px")
  await page.keyboard.press("ControlOrMeta+Shift+d")
  await expect(panel).toHaveCount(0)
})

test("rail, inspector, and custom commands are accessible and responsive", async ({ page }) => {
  await signIn(page)
  const trigger = page.getByRole("button", { name: "Open Plainworks inspector" })
  await trigger.focus()
  await page.keyboard.press("Enter")
  const panel = page.getByRole("dialog", { name: "Plainworks inspector" })
  await expect(panel).toBeVisible()
  await panel.getByRole("tab", { name: "mock", exact: true }).click()
  const errorSwitch = panel.getByRole("switch", { name: "Simulate API errors" })
  await errorSwitch.click()
  await expect(errorSwitch).toBeChecked()
  await page.keyboard.press("Escape")
  await expect(trigger).toBeFocused()
  await page
    .getByRole("region", { name: "Diagnostics" })
    .getByRole("button", { name: "Mock errors: on" })
    .click()
  await expect(panel.getByRole("tab", { name: "mock", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  )
  await errorSwitch.click()
  await expect(errorSwitch).not.toBeChecked()

  await panel.getByRole("button", { name: "Reset mock data" }).click()
  const confirmation = page.getByRole("alertdialog", { name: "Reset mock data?" })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole("button", { name: "Cancel" }).click()
  await expect(confirmation).toBeHidden()
  await panel.getByRole("button", { name: "Reset mock data" }).click()
  await confirmation.getByRole("button", { name: "Reset", exact: true }).click()
  await expect(panel.getByRole("status")).toHaveText("Mock data reset")

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" })
    await page.locator("html").evaluate((element, dark) => {
      element.classList.toggle("dark", dark)
    }, colorScheme === "dark")
    await expectNoBrowserAxeViolations(page)
    await page.setViewportSize({ width: 320, height: 512 })
    expect(
      await panel.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1)
    await expectNoBrowserAxeViolations(page)
    await page.setViewportSize({ width: 1280, height: 800 })
  }
  await page.setViewportSize({ width: 320, height: 512 })
  await expect(panel).toBeVisible()
  const box = await panel.boundingBox()
  expect(box?.width).toBeLessThanOrEqual(320)
  await page.keyboard.press("Escape")
  await expectNoBrowserAxeViolations(page)
  expect(
    await page
      .getByRole("region", { name: "Diagnostics" })
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(320)
})
