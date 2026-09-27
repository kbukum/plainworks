import {
  COMPACT_MATRIX,
  DIALOG_MATRIX,
  planVisualTests,
  pressWithKeyboard,
  runVisualTest,
  VISUAL_TAG,
  type VisualMatrix,
  type VisualSurface,
} from "@plainworks/testkit/browser"
import type { Page } from "@playwright/test"
import { appRoute, openPausedTasks, openRoute } from "../support/app"
import { expect, test } from "../support/gate"

// Every overlay of the app open over its page, on a wide and a narrow screen in both modes. Each
// capture also runs axe on the open overlay and checks that keyboard focus inside it is visible,
// so overlays open from the keyboard, the way that focus check's user reaches them.

const MOBILE_ONLY: VisualMatrix = { modes: COMPACT_MATRIX.modes, viewports: ["mobile"] }

async function openCommandPalette(page: Page): Promise<void> {
  await openRoute(page, appRoute("overview"))
  await page.keyboard.press("ControlOrMeta+k")
  await expect(page.getByRole("combobox", { name: "Command menu" })).toBeFocused()
}

async function openTaskDialog(page: Page): Promise<void> {
  await openPausedTasks(page)
  await pressWithKeyboard(page.getByRole("button", { name: "New task" }))
  await expect(
    page.getByRole("dialog", { name: "New task" }).getByRole("textbox", { name: "Title" }),
  ).toBeFocused()
}

const overlays: readonly VisualSurface[] = [
  {
    name: "command-palette",
    matrix: DIALOG_MATRIX,
    checks: { focus: true },
    arrange: openCommandPalette,
  },
  {
    name: "command-palette-no-results",
    matrix: DIALOG_MATRIX,
    checks: { focus: true },
    arrange: async (page) => {
      await openCommandPalette(page)
      await page.getByRole("combobox", { name: "Command menu" }).fill("zzzz-nothing")
      await expect(page.getByText("No matching commands.")).toBeVisible()
    },
  },
  {
    name: "account-menu",
    matrix: COMPACT_MATRIX,
    checks: { focus: true },
    arrange: async (page) => {
      await openRoute(page, appRoute("overview"))
      await pressWithKeyboard(page.getByRole("button", { name: /Signed in as/ }))
      await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible()
    },
  },
  {
    name: "color-mode-menu",
    matrix: COMPACT_MATRIX,
    checks: { focus: true },
    arrange: async (page) => {
      await openRoute(page, appRoute("overview"))
      await pressWithKeyboard(page.getByRole("button", { name: /^Color mode/ }))
      await expect(page.getByRole("menuitemradio", { name: "Dark" })).toBeVisible()
    },
  },
  {
    name: "sections-drawer",
    matrix: MOBILE_ONLY,
    checks: { focus: true },
    arrange: async (page) => {
      await openRoute(page, appRoute("overview"))
      await pressWithKeyboard(page.getByRole("button", { name: "Open sections menu" }))
      await expect(page.getByRole("navigation", { name: "Sections" })).toBeVisible()
    },
  },
  {
    name: "task-new-dialog",
    matrix: DIALOG_MATRIX,
    checks: { focus: true },
    arrange: openTaskDialog,
  },
  {
    name: "task-new-dialog-invalid",
    matrix: DIALOG_MATRIX,
    checks: { focus: true },
    arrange: async (page) => {
      await openTaskDialog(page)
      const dialog = page.getByRole("dialog", { name: "New task" })
      await pressWithKeyboard(dialog.getByRole("button", { name: "Create task" }))
      const title = dialog.getByRole("textbox", { name: "Title" })
      await expect(title).toHaveAttribute("aria-invalid", "true")
      await expect(title).toBeFocused()
    },
  },
  {
    name: "task-edit-dialog",
    matrix: DIALOG_MATRIX,
    checks: { focus: true },
    arrange: async (page) => {
      await openPausedTasks(page)
      await pressWithKeyboard(page.getByRole("button", { name: /^Edit / }).first())
      await expect(page.getByRole("dialog", { name: "Edit task" })).toBeVisible()
    },
  },
  {
    name: "task-filter-editor",
    matrix: COMPACT_MATRIX,
    checks: { focus: true },
    arrange: async (page) => {
      await openPausedTasks(page)
      await pressWithKeyboard(page.getByRole("button", { name: "Add filter" }))
      await expect(
        page
          .getByRole("group", { name: "Filters" })
          .getByRole("group", { name: "Filter 1" })
          .getByRole("combobox", { name: "Field" }),
      ).toBeFocused()
    },
  },
  {
    name: "catalog-filters-drawer",
    matrix: MOBILE_ONLY,
    checks: { focus: true },
    arrange: async (page) => {
      await openRoute(page, appRoute("orders"))
      await pressWithKeyboard(page.getByRole("button", { name: /^Filters/ }))
      await expect(page.getByRole("dialog", { name: "Order filters" })).toBeVisible()
    },
  },
  {
    name: "order-detail-dialog",
    matrix: DIALOG_MATRIX,
    checks: { focus: true },
    arrange: async (page) => {
      await openRoute(page, appRoute("orders"))
      await pressWithKeyboard(page.getByRole("button", { name: /^View order/ }).first())
      await expect(page.getByRole("dialog", { name: /Order for/ })).toBeVisible()
    },
  },
  {
    name: "product-detail-dialog",
    matrix: DIALOG_MATRIX,
    checks: { focus: true },
    arrange: async (page) => {
      await openRoute(page, appRoute("products"))
      await pressWithKeyboard(page.getByRole("button", { name: /^View details/ }).first())
      await expect(page.getByRole("dialog").getByText("Stock on hand")).toBeVisible()
    },
  },
  {
    name: "user-profile-dialog",
    matrix: DIALOG_MATRIX,
    checks: { focus: true },
    arrange: async (page) => {
      await openRoute(page, appRoute("users"))
      await pressWithKeyboard(page.getByRole("button", { name: /^View profile/ }).first())
      await expect(page.getByRole("dialog").getByText("Member since")).toBeVisible()
    },
  },
  {
    name: "toast",
    matrix: COMPACT_MATRIX,
    arrange: async (page) => {
      await openRoute(page, appRoute("notifications"))
      await page
        .getByRole("button", { name: /^Mark read/ })
        .first()
        .click()
      await expect(page.getByText("Marked as read")).toBeVisible()
      // Hovering pauses the toast's dismissal timer, so it stays through the checks and capture.
      await page.getByRole("listitem").filter({ hasText: "Marked as read" }).hover()
    },
  },
]

for (const planned of planVisualTests(overlays)) {
  test(planned.title, { tag: VISUAL_TAG }, ({ page, runtimeErrors }) =>
    runVisualTest({ page, runtimeErrors }, planned),
  )
}
