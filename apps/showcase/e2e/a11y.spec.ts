import { expect, type Page, test } from "@playwright/test"
import { expectNoBrowserAxeViolations, expectReflowAtNarrowViewport } from "./axe"
import { signIn } from "./session"

// A browser accessibility gate over the showcase's real authenticated flow: the session
// gate lands the user on the overview, then client-side navigation reaches the query-driven task
// view. Each rendered state is scanned with axe-core for the layout-dependent rules jsdom cannot
// measure (color contrast, 24x24 target size), and the flow is re-checked under dark mode and
// reduced motion so those preferences are honored, not just the default paint.

/** Open the query-driven task list through the app's own client-side navigation. */
async function openTasks(page: Page): Promise<void> {
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Tasks" })
    .click()
  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible()
}

test("skip link bypasses persistent navigation to main landmark", async ({ page }) => {
  await signIn(page)
  await page.keyboard.press("Tab")
  const skipLink = page.getByRole("link", { name: "Skip to main content" })
  await expect(skipLink).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page.locator("#main-content")).toBeFocused()
})

test("authenticated flow has no contrast or target-size violations", async ({ page }) => {
  await signIn(page)
  await expectNoBrowserAxeViolations(page)

  await openTasks(page)
  await expectNoBrowserAxeViolations(page)
})

test("keyboard focus remains visible in forced-colors mode", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" })
  await signIn(page)

  const search = page.getByRole("button", { name: "Search sections and actions" })
  await search.focus()
  await expect(search).toHaveCSS("outline-style", "solid")
  await expect(search).toHaveCSS("outline-width", "2px")
})

test("task view reflows at a 320px viewport without horizontal scrolling", async ({ page }) => {
  await signIn(page)
  await openTasks(page)
  await expectReflowAtNarrowViewport(page)
})

test("logging out returns to the signed-out login page", async ({ page }) => {
  await signIn(page)

  await page.getByRole("button", { name: /Signed in as/ }).click()
  await page.getByRole("menuitem", { name: "Log out" }).click()

  // The mock IdP approves in-process, so the session gate must not restart login on its own:
  // logging out lands on the signed-out page and stays there until an explicit sign-in.
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
  await expectNoBrowserAxeViolations(page)
})

test("authentication routes reject unsupported methods", async ({ request }) => {
  const cases = [
    { path: "/login", allow: "GET, HEAD, POST" },
    { path: "/auth/callback", allow: "GET" },
    { path: "/logout", allow: "POST" },
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

test("flow stays accessible under dark mode and reduced motion", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })

  await signIn(page)
  await expect(page.locator("html")).toHaveClass(/\bdark\b/)
  await expect(page.locator("[data-mode='dark']")).toBeVisible()
  await expectNoBrowserAxeViolations(page)

  await openTasks(page)
  await expectNoBrowserAxeViolations(page)
})
