import { expect, type Locator, type Page, test } from "@playwright/test"
import { expectNoBrowserAxeViolations } from "./axe"
import { signIn } from "./session"

const sections = [
  {
    name: "Overview",
    path: "/",
    ready: (page: Page) => page.getByText("Revenue trend", { exact: true }),
  },
  {
    name: "Tasks",
    path: "/tasks",
    ready: (page: Page) => page.getByRole("table", { name: /Tasks/ }),
  },
  {
    name: "Orders",
    path: "/orders",
    ready: (page: Page) => page.getByRole("table", { name: /Orders/ }),
  },
  {
    name: "Products",
    path: "/products",
    ready: (page: Page) => page.getByRole("list", { name: "Product results" }),
  },
  {
    name: "Users",
    path: "/users",
    ready: (page: Page) => page.getByRole("table", { name: /Users/ }),
  },
  {
    name: "Notifications",
    path: "/notifications",
    ready: (page: Page) => page.getByRole("list", { name: "Notifications" }),
  },
  {
    name: "Settings",
    path: "/settings",
    ready: (page: Page) => page.getByLabel("Display name"),
  },
] as const

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/mock/reset")
  expect(reset.ok()).toBe(true)
})

async function openSection(page: Page, name: string, path: string, ready: Locator): Promise<void> {
  await page.goto(path)
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()
  await expect(ready).toBeVisible()
}

test("every product section renders real content and passes browser accessibility", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await signIn(page)

  for (const section of sections) {
    await openSection(page, section.name, section.path, section.ready(page))
    await expectNoBrowserAxeViolations(page)
  }
})

test("command palette navigates and runs a real theme action", async ({ page }) => {
  await signIn(page)

  await page.keyboard.press("Control+k")
  const command = page.getByRole("combobox", { name: "Command menu" })
  await expect(command).toBeVisible()
  await command.fill("orders")
  await page.getByRole("option", { name: /Orders/ }).click()
  await expect(page).toHaveURL(/\/orders$/)
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible()

  await expect(page.getByRole("combobox", { name: "Command menu" })).toBeHidden()
  await page.keyboard.press("Control+k")
  const actionSearch = page.getByRole("combobox", { name: "Command menu" })
  await actionSearch.fill("theme")
  await page.getByRole("option", { name: /Switch to dark mode/ }).click()
  await expect(page.locator("html")).toHaveClass(/\bdark\b/)
  await expect(page.getByText("Switched to dark mode")).toBeVisible()
})

test("task create and edit reconcile through the live application", async ({ page }) => {
  await signIn(page)
  await openSection(page, "Tasks", "/tasks", page.getByRole("table", { name: /Tasks/ }))

  await page.getByRole("button", { name: "New task" }).click()
  const createDialog = page.getByRole("dialog", { name: "New task" })
  await createDialog.getByRole("textbox", { name: "Title" }).fill("Verify flagship journeys")
  await createDialog.getByRole("combobox", { name: "Priority" }).selectOption("high")
  await createDialog.getByRole("button", { name: "Create task" }).click()

  await expect(
    page.getByRole("cell", { name: "Verify flagship journeys", exact: true }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Edit Verify flagship journeys" }).click()
  const editDialog = page.getByRole("dialog", { name: "Edit task" })
  await editDialog.getByRole("textbox", { name: "Title" }).fill("Flagship journeys verified")
  await editDialog.getByRole("button", { name: "Save changes" }).click()

  await expect(
    page.getByRole("cell", { name: "Flagship journeys verified", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("cell", { name: "Verify flagship journeys", exact: true }),
  ).toHaveCount(0)
})

test("catalogs filter, sort, paginate, mutate, and open details", async ({ page }) => {
  await signIn(page)
  await openSection(page, "Orders", "/orders", page.getByRole("table", { name: /Orders/ }))

  const customerHeader = page.getByRole("columnheader", { name: /Customer/ })
  await customerHeader.getByRole("button").click()
  await expect(customerHeader).toHaveAttribute("aria-sort", "ascending")
  await page.getByRole("button", { name: "Go to next page" }).click()
  await expect(page.getByRole("button", { name: "Go to page 2, current page" })).toHaveAttribute(
    "aria-current",
    "page",
  )
  await page.getByRole("checkbox", { name: /Delivered/ }).click()
  await expect(page.getByRole("button", { name: "Go to page 1, current page" })).toHaveAttribute(
    "aria-current",
    "page",
  )

  await page
    .getByRole("button", { name: /^View order/ })
    .first()
    .click()
  const order = page.getByRole("dialog", { name: /Order for/ })
  const status = order.getByRole("combobox", { name: "Update status" })
  const original = await status.inputValue()
  const target = original === "processing" ? "shipped" : "processing"
  await status.selectOption(target)
  await expect(status).toHaveValue(target)
  await expect(status).toBeEnabled()
  await order.getByRole("button", { name: "Close" }).click()

  await openSection(
    page,
    "Products",
    "/products",
    page.getByRole("list", { name: "Product results" }),
  )
  await page.getByRole("checkbox", { name: /Electronics/ }).click()
  const products = page.getByRole("list", { name: "Product results" })
  await expect(products.getByRole("listitem").first().getByText("Electronics")).toBeVisible()
  await products
    .getByRole("button", { name: /^View details/ })
    .first()
    .click()
  await expect(page.getByRole("dialog").getByText("Stock on hand")).toBeVisible()
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click()

  await openSection(page, "Users", "/users", page.getByRole("table", { name: /Users/ }))
  await page.getByRole("checkbox", { name: /Active/ }).click()
  await page
    .getByRole("button", { name: /^View profile/ })
    .first()
    .click()
  const profile = page.getByRole("dialog")
  await expect(profile.getByText("Member since")).toBeVisible()
  await expect(profile.getByText("Last active")).toBeVisible()
})

test("notification actions update the feed and unread indicator", async ({ page }) => {
  await signIn(page)
  await openSection(
    page,
    "Notifications",
    "/notifications",
    page.getByRole("list", { name: "Notifications" }),
  )

  const markRead = page.getByRole("button", { name: /^Mark read/ })
  // The feed is a lazily loaded, client-fetched section, so wait for the first unread row to
  // settle before the one-shot count — otherwise a slow CI hydrate counts zero buttons.
  await expect(markRead.first()).toBeVisible()
  const unreadBefore = await markRead.count()
  expect(unreadBefore).toBeGreaterThan(0)
  await markRead.first().click()
  await expect(markRead).toHaveCount(unreadBefore - 1)
  await expect(page.getByText("Marked as read")).toBeVisible()

  await page.getByRole("button", { name: "Mark all read" }).click()
  await expect(markRead).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Notifications" }).first()).toBeVisible()
  await expect(page.getByText("All notifications marked read")).toBeVisible()
})

test("primary overlays and forms remain keyboard operable", async ({ page }) => {
  await signIn(page)
  await page.keyboard.press("Control+k")
  const command = page.getByRole("combobox", { name: "Command menu" })
  await expect(command).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(command).toBeHidden()

  await page.goto("/tasks")
  const newTask = page.getByRole("button", { name: "New task" })
  await newTask.focus()
  await page.keyboard.press("Enter")
  const dialog = page.getByRole("dialog", { name: "New task" })
  await expect(dialog.getByRole("textbox", { name: "Title" })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(newTask).toBeFocused()
})

test("developer mock inspector mounts and drives a control", async ({ page }) => {
  await signIn(page)
  // The inspector loads only through the DEV-gated dynamic import + isolated mount in the client
  // entry, so opening it here exercises that path the component tests cannot reach.
  const trigger = page.getByRole("button", { name: "Open Plainworks inspector" })
  await expect(trigger).toBeVisible()
  await trigger.click()

  const panel = page.getByRole("dialog", { name: "Plainworks inspector" })
  await expect(panel).toBeVisible()
  await expectNoBrowserAxeViolations(page)

  // The mock behavior controls live in the app-owned custom renderer under the source's own tab.
  await panel.getByRole("tab", { name: "mock" }).click()
  const errorToggle = panel.getByRole("switch", { name: "Simulate API errors" })
  await errorToggle.click()
  await expect(panel.getByText("Error simulation enabled")).toBeVisible()
  await errorToggle.click()
  await expect(panel.getByText("Error simulation disabled")).toBeVisible()
})
