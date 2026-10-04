import { expectNoPageAxeViolations } from "@plainworks/testkit/playwright"
import { expect, test } from "./support/gate"
import { signIn } from "./support/session"

// Accessibility behavior the flows cannot see from a checkpoint: skip link target, forced-colors
// focus, logout, and the auth routes' HTTP contract.

test("skip link bypasses persistent navigation to main landmark", async ({ page }) => {
  await signIn(page)
  await page.keyboard.press("Tab")
  const skipLink = page.getByRole("link", { name: "Skip to main content" })
  await expect(skipLink).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page.locator("#main-content")).toBeFocused()
})

test("keyboard focus remains visible in forced-colors mode", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" })
  await signIn(page)

  const search = page.getByRole("button", { name: "Search sections and actions" })
  await search.focus()
  await expect(search).toHaveCSS("outline-style", "solid")
  await expect(search).toHaveCSS("outline-width", "2px")
})

test("logging out returns to the signed-out login page", async ({ page }) => {
  await signIn(page)

  await page.getByRole("button", { name: /Signed in as/ }).click()
  await page.getByRole("menuitem", { name: "Log out" }).click()

  // The mock IdP approves in-process, so the session gate must not restart login on its own:
  // logging out lands on the signed-out page and stays there until an explicit sign-in.
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
  await expectNoPageAxeViolations(page)
})

test("a callback without its login cookie explains itself and signs in again", async ({ page }) => {
  await page.context().clearCookies()
  // Sign-in begun on another origin, or left open past the cookie's lifetime, arrives like this.
  await page.goto("/auth/callback?code=stale&state=stale")
  await expect(page.getByRole("alert")).toContainText("Sign-in didn't finish")
  await expectNoPageAxeViolations(page)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByRole("button", { name: /Signed in as/ })).toBeVisible()
})

test("authentication routes reject unsupported methods", async ({ request }) => {
  const cases = [
    { path: "/login", allow: "GET, HEAD, POST" },
    { path: "/auth/callback", allow: "GET" },
    { path: "/auth/logout", allow: "POST" },
  ] as const

  for (const route of cases) {
    const response = await request.put(route.path)
    expect(response.status()).toBe(405)
    expect(response.headers().allow).toBe(route.allow)
    expect(await response.text()).toBe("Method Not Allowed")
  }

  const head = await request.head("/login")
  expect(head.status()).toBe(200)
  expect(await head.text()).toBe("")
})
