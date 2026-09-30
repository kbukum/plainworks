import { defineFlow, focusWithKeyboard, pressWithKeyboard } from "@plainworks/testkit/playwright"
import { expect } from "@playwright/test"
import { appRoute, openPausedTasks, openRoute } from "../support/app"

/**
 * Every menu, popover, drawer, and toast of the app, open over its page. Each opens from the
 * keyboard, the way the focus check's user reaches it, and each checkpoint reloads its page, so no
 * overlay leaks into the next. Drawers open only where a narrow screen moves the content into one;
 * a wide screen shows that content in place, and the focus check lands on its first control.
 */
export const overlaysFlow = defineFlow({
  name: "overlays",
  covers: [
    "apps/showcase/e2e/flows/overlays.ts",
    "apps/showcase/src/client/{shell,command,catalog,notifications,tasks,feedback}/**",
    "packages/ui/src/client/{shell,navigation,overlays,feedback,forms}/**",
    "packages/elements/src/**",
  ],
  checkpoints: [
    {
      name: "account-menu",
      act: async (page, { signal }) => {
        await openRoute(page, appRoute("overview"), signal)
        await pressWithKeyboard(page.getByRole("button", { name: /Signed in as/ }))
      },
      ready: (page) => page.getByRole("menuitem", { name: "Log out" }),
      checks: { focus: true },
    },
    {
      name: "color-mode-menu",
      act: async (page, { signal }) => {
        await openRoute(page, appRoute("overview"), signal)
        await pressWithKeyboard(page.getByRole("button", { name: /^Color mode/ }))
      },
      ready: (page) => page.getByRole("menuitemradio", { name: "Dark" }),
      checks: { focus: true },
    },
    {
      name: "sections",
      act: async (page, { signal }) => {
        await openRoute(page, appRoute("overview"), signal)
        const open = page.getByRole("button", { name: "Open sections menu" })
        if (await open.isVisible()) await pressWithKeyboard(open)
        else
          await focusWithKeyboard(
            page.getByRole("navigation", { name: "Primary" }).getByRole("link").first(),
          )
      },
      ready: (page) =>
        page
          .getByRole("navigation", { name: "Sections" })
          .or(page.getByRole("navigation", { name: "Primary" }))
          .first(),
      checks: { focus: true },
    },
    {
      name: "task-filter-editor",
      act: async (page, { signal }) => {
        await openPausedTasks(page, signal)
        await pressWithKeyboard(page.getByRole("button", { name: "Add filter" }))
      },
      ready: (page) =>
        page
          .getByRole("group", { name: "Filters" })
          .getByRole("group", { name: "Filter 1" })
          .getByRole("combobox", { name: "Field" }),
      checks: { focus: true },
    },
    {
      name: "catalog-filters",
      act: async (page, { signal }) => {
        await openRoute(page, appRoute("orders"), signal)
        const open = page.getByRole("button", { name: /^Filters/ })
        if (await open.isVisible()) await pressWithKeyboard(open)
        else
          await focusWithKeyboard(
            page
              .getByRole("complementary", { name: "Order filters" })
              .locator("input, button, [role='combobox']")
              .first(),
          )
      },
      ready: (page) =>
        page
          .getByRole("dialog", { name: "Order filters" })
          .or(page.getByRole("complementary", { name: "Order filters" }))
          .first(),
      checks: { focus: true },
    },
    {
      name: "toast",
      act: async (page, { signal }) => {
        await openRoute(page, appRoute("notifications"), signal)
        await page
          .getByRole("button", { name: /^Mark read/ })
          .first()
          .click({ signal })
        await expect(page.getByText("Marked as read")).toBeVisible()
        // Hovering pauses the toast's dismissal timer, so it stays through every variant's checks.
        await page.getByRole("dialog").filter({ hasText: "Marked as read" }).hover()
      },
      ready: (page) => page.getByText("Marked as read"),
    },
  ],
})
