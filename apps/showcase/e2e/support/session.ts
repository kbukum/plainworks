import { expect, type Page } from "@playwright/test"

/**
 * Sign in through the real mock IdP flow and land on the overview. It is a no-op for a page that is
 * already signed in, so a test can call it after changing the session.
 */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/")
  const signInButton = page.getByRole("button", { name: "Sign in" })
  if (await signInButton.isVisible()) {
    await signInButton.click()
    await page.waitForLoadState("load")
  }
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible()
}
