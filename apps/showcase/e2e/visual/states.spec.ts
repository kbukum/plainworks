import {
  COMPACT_MATRIX,
  planVisualTests,
  runVisualTest,
  VISUAL_TAG,
  type VisualSurface,
} from "@plainworks/testkit/browser"
import type { Page } from "@playwright/test"
import {
  type AppRoute,
  appRoute,
  navigateTo,
  openPausedTasks,
  openRoute,
  PAGE_CAPTURE,
} from "../support/app"
import { expect, test } from "../support/gate"

// Every page state besides "loaded": loading, failed, empty, finished, invalid, overlong content,
// and the server paint before the client takes over. The server renders each page with its data,
// so loading and failure are reached the way users meet them: navigating inside the app while the
// API hangs or fails.

// A failed request logs this line in the console; the error state is the point of the capture.
const FAILED_REQUEST = /status of 500/

/** Navigate from the overview to `route` while every API request hangs. */
async function navigateWhileLoading(page: Page, route: AppRoute): Promise<void> {
  await openRoute(page, appRoute(route.slug === "overview" ? "users" : "overview"))
  await page.route("**/api/**", () => undefined)
  await navigateTo(page, route)
  await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible()
  await expect(page.getByRole("status", { name: /^Loading/ }).first()).toBeVisible()
}

/** Navigate from another page to `route` while every API request fails. */
async function navigateWhileFailing(page: Page, route: AppRoute, title: string): Promise<void> {
  await openRoute(page, appRoute(route.slug === "overview" ? "users" : "overview"))
  await page.route("**/api/**", (request) =>
    request.fulfill({ status: 500, contentType: "application/json", body: '{"error":"boom"}' }),
  )
  await navigateTo(page, route)
  await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 })
}

const loading: readonly VisualSurface[] = [
  "overview",
  "tasks",
  "orders",
  "products",
  "users",
  "notifications",
  "settings-profile",
].map((slug) => ({
  name: `${slug}-loading`,
  matrix: COMPACT_MATRIX,
  arrange: (page) => navigateWhileLoading(page, appRoute(slug)),
}))

const failed: readonly VisualSurface[] = [
  ["overview", "Revenue trend is unavailable"],
  ["tasks", "Tasks are unavailable"],
  ["orders", "Orders are unavailable"],
  ["products", "Products are unavailable"],
  ["users", "Users are unavailable"],
  ["settings-profile", "Settings are unavailable"],
].map(([slug = "", title = ""]) => ({
  name: `${slug}-error`,
  matrix: COMPACT_MATRIX,
  capture: PAGE_CAPTURE,
  allowErrors: [FAILED_REQUEST],
  arrange: (page) => navigateWhileFailing(page, appRoute(slug), title),
}))

// The header's unread badge shares the notifications feed query, and every page prefetches it, so
// that feed fails only when it never loads: the mock backend fails from the first request.
const notificationsFailed: VisualSurface = {
  name: "notifications-error",
  matrix: COMPACT_MATRIX,
  capture: PAGE_CAPTURE,
  allowErrors: [FAILED_REQUEST],
  arrange: async (page) => {
    const response = await page.request.post("/mock/error", { data: { enabled: true } })
    expect(response.ok()).toBe(true)
    await page.goto(appRoute("notifications").path)
    await expect(page.getByText("Notifications are unavailable")).toBeVisible({ timeout: 20_000 })
  },
}

const empty: readonly VisualSurface[] = [
  ["orders", "Search orders"],
  ["products", "Search products"],
  ["users", "Search users"],
].map(([slug = "", search = ""]) => ({
  name: `${slug}-empty`,
  matrix: COMPACT_MATRIX,
  arrange: async (page) => {
    await openRoute(page, appRoute(slug))
    await page.getByRole("searchbox", { name: search }).fill("zzzz-no-match")
    await expect(page.getByText(/^No .* match/)).toBeVisible()
  },
}))

const LONG_TASK_TITLE =
  "An intentionally long task title that keeps going to check wrapping, truncation, and column behavior under real content: Supercalifragilisticexpialidocious"
const LONG_NAME = "Maximiliana Alexandrina Wolfeschlegelsteinhausenbergerdorff-Featherstonehaugh"

const other: readonly VisualSurface[] = [
  {
    name: "notifications-all-read",
    matrix: COMPACT_MATRIX,
    capture: PAGE_CAPTURE,
    arrange: async (page) => {
      await openRoute(page, appRoute("notifications"))
      await page.getByRole("button", { name: "Mark all read" }).click()
      await expect(page.getByRole("button", { name: /^Mark read/ })).toHaveCount(0)
      await expect(page.getByText("All notifications marked read")).toBeHidden({ timeout: 10_000 })
    },
  },
  {
    name: "overview-range-90-days",
    matrix: COMPACT_MATRIX,
    capture: PAGE_CAPTURE,
    arrange: async (page) => {
      await openRoute(page, appRoute("overview"))
      const last90 = page.getByRole("button", { name: "Last 90 days" })
      await last90.click()
      await expect(last90).toHaveAttribute("aria-pressed", "true")
      await page.waitForLoadState("networkidle")
    },
  },
  {
    name: "tasks-long-content",
    matrix: COMPACT_MATRIX,
    capture: PAGE_CAPTURE,
    arrange: async (page) => {
      // Retitle the first row, so the long title lands on the first page of the sorted table.
      await openPausedTasks(page)
      await page
        .getByRole("button", { name: /^Edit / })
        .first()
        .click()
      const dialog = page.getByRole("dialog", { name: "Edit task" })
      await dialog.getByRole("textbox", { name: "Title" }).fill(LONG_TASK_TITLE)
      await dialog.getByRole("button", { name: /^Save/ }).click()
      await expect(dialog).toBeHidden()
      await expect(page.getByRole("cell", { name: LONG_TASK_TITLE, exact: true })).toBeVisible()
    },
  },
  {
    name: "settings-profile-invalid",
    matrix: COMPACT_MATRIX,
    capture: PAGE_CAPTURE,
    arrange: async (page) => {
      await openRoute(page, appRoute("settings-profile"))
      await page.getByLabel("Display name").fill("")
      await page.getByRole("button", { name: "Save profile" }).click()
      await expect(page.getByText("Display name is required.")).toBeVisible()
      await expect(page.getByLabel("Display name")).toBeFocused()
    },
  },
  {
    name: "settings-profile-long-content",
    matrix: COMPACT_MATRIX,
    capture: PAGE_CAPTURE,
    arrange: async (page) => {
      await openRoute(page, appRoute("settings-profile"))
      await page.getByLabel("Display name").fill(LONG_NAME)
      await page.getByRole("button", { name: "Save profile" }).click()
      await expect(page.getByText("Profile saved")).toBeVisible()
      await expect(page.getByText("Profile saved")).toBeHidden({ timeout: 10_000 })
    },
  },
]

// The server paint alone: the client entry never loads, so the page must already be styled.
const serverPaint: readonly VisualSurface[] = ["overview", "tasks", "settings-appearance"].map(
  (slug) => ({
    name: `${slug}-server-paint`,
    matrix: COMPACT_MATRIX,
    capture: PAGE_CAPTURE,
    // The client bundle is blocked, so the page never hydrates.
    checks: { hydration: false },
    allowErrors: [/Failed to load resource/],
    arrange: async (page) => {
      const route = appRoute(slug)
      await page.route("**/src/client/entry-client.tsx", (request) => request.abort())
      await page.goto(route.path, { waitUntil: "load" })
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible()
    },
  }),
)

for (const planned of planVisualTests([
  ...loading,
  ...failed,
  notificationsFailed,
  ...empty,
  ...other,
  ...serverPaint,
])) {
  test(planned.title, { tag: VISUAL_TAG }, ({ page, runtimeErrors }) =>
    runVisualTest({ page, runtimeErrors }, planned),
  )
}
