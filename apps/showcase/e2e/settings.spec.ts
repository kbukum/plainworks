import type { Locator, Page } from "@playwright/test"
import { expect, test } from "./support/gate"

async function openSettings(page: Page, path: string, ready: Locator): Promise<void> {
  await page.goto(path)
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible()
  await expect(ready).toBeVisible()
}

test("settings tabs deep-link and support keyboard history navigation", async ({ page }) => {
  await openSettings(page, "/settings", page.getByLabel("Display name"))

  const profileTab = page.getByRole("tab", { name: "Profile" })
  const preferencesTab = page.getByRole("tab", { name: "Preferences" })
  await profileTab.focus()
  await page.keyboard.press("ArrowRight")
  await expect(preferencesTab).toBeFocused()
  await page.keyboard.press("Enter")

  await expect(page).toHaveURL(/\/settings\/preferences$/)
  await expect(page.getByLabel("Rows per page")).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByLabel("Display name")).toBeVisible()
})

test("account settings validate, save, and reload through the server", async ({ page }) => {
  await openSettings(page, "/settings", page.getByLabel("Display name"))

  const displayName = page.getByLabel("Display name")
  await displayName.fill("")
  await page.getByRole("button", { name: "Save profile" }).click()
  await expect(page.getByText("Display name is required.")).toBeVisible()

  await displayName.fill("Grace Hopper")
  await page.getByRole("button", { name: "Save profile" }).click()
  await expect(page.getByText("Profile saved")).toBeVisible()
  await page.reload()
  await expect(page.getByLabel("Display name")).toHaveValue("Grace Hopper")

  await page.getByLabel("Display name").fill("Ada Lovelace")
  await page.getByRole("button", { name: "Save profile" }).click()
  await expect(page.getByText("Profile saved")).toBeVisible()

  await page.getByRole("tab", { name: "Preferences" }).click()
  const rows = page.getByLabel("Rows per page")
  await rows.fill("40")
  await page.getByRole("button", { name: "Save preferences" }).click()
  await expect(page.getByText("Preferences saved")).toBeVisible()
  await page.reload()
  await expect(page.getByLabel("Rows per page")).toHaveValue("40")

  await page.getByLabel("Rows per page").fill("20")
  await page.getByRole("button", { name: "Save preferences" }).click()
  await expect(page.getByText("Preferences saved")).toBeVisible()

  await page.getByRole("tab", { name: "Notifications" }).click()
  const sms = page.getByRole("switch", { name: "SMS" })
  await sms.click()
  await page.getByRole("button", { name: "Save notifications" }).click()
  await expect(page.getByText("Notification settings saved")).toBeVisible()
  await page.reload()
  await expect(page.getByRole("switch", { name: "SMS" })).toBeChecked()

  await page.getByRole("switch", { name: "SMS" }).click()
  await page.getByRole("button", { name: "Save notifications" }).click()
  await expect(page.getByText("Notification settings saved")).toBeVisible()
})

test("appearance choices apply immediately and persist across reload", async ({ page }) => {
  await openSettings(page, "/settings/appearance", page.getByRole("radiogroup", { name: "Motion" }))

  const panel = page.getByRole("tabpanel", { name: "Appearance" })
  await panel
    .getByRole("group", { name: "Color mode" })
    .getByRole("button", { name: "Dark" })
    .click()
  await panel
    .getByRole("group", { name: "Accent color" })
    .getByRole("button", { name: "Violet" })
    .click()
  await panel.getByRole("radio", { name: /Reduced motion/ }).click()

  await expect(page.locator("html")).toHaveClass(/\bdark\b/)
  await expect(page.locator('[data-motion="reduce"]')).toBeVisible()

  await page.reload()

  const reloadedPanel = page.getByRole("tabpanel", { name: "Appearance" })
  await expect(
    reloadedPanel.getByRole("group", { name: "Color mode" }).getByRole("button", { name: "Dark" }),
  ).toHaveAttribute("aria-pressed", "true")
  await expect(
    reloadedPanel
      .getByRole("group", { name: "Accent color" })
      .getByRole("button", { name: "Violet" }),
  ).toHaveAttribute("aria-pressed", "true")
  await expect(reloadedPanel.getByRole("radio", { name: /Reduced motion/ })).toHaveAttribute(
    "aria-checked",
    "true",
  )
})
