import { expect, type Page } from "@playwright/test"

/**
 * Sign in through the real BFF chain (login, mock IdP, callback) and land on Tasks, where the
 * header's Sign in button returns a guest.
 */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible()
}
