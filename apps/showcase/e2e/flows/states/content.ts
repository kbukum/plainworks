import { defineFlow } from "@plainworks/testkit/browser"
import { expect } from "@playwright/test"
import { appRoute, openPausedTasks, openRoute } from "../../support/app"
import { PAGE_FRAME } from "../frame"

const LONG_TASK_TITLE =
  "An intentionally long task title that keeps going to check wrapping, truncation, and column behavior under real content: Supercalifragilisticexpialidocious"
const LONG_NAME = "Maximiliana Alexandrina Wolfeschlegelsteinhausenbergerdorff-Featherstonehaugh"

/**
 * Pages after a user changed what they show: every notification read, a wider revenue range,
 * overlong content, and a form that failed validation.
 */
export const contentFlow = defineFlow({
  name: "content",
  covers: [
    "apps/showcase/e2e/flows/states/content.ts",
    "apps/showcase/src/client/{notifications,overview,tasks,settings}/**",
    "packages/ui/src/client/{data-table,display,forms,list}/**",
  ],
  checkpoints: [
    {
      name: "notifications-all-read",
      act: async (page, { signal }) => {
        await openRoute(page, appRoute("notifications"), signal)
        await page.getByRole("button", { name: "Mark all read" }).click({ signal })
        await expect(page.getByRole("button", { name: /^Mark read/ })).toHaveCount(0)
        await expect(page.getByText("All notifications marked read")).toBeHidden({
          timeout: 10_000,
        })
      },
      ready: (page) => page.getByRole("list", { name: "Notifications" }),
      frame: PAGE_FRAME,
    },
    {
      name: "overview-range-90-days",
      act: async (page, { signal }) => {
        await openRoute(page, appRoute("overview"), signal)
        const last90 = page.getByRole("button", { name: "Last 90 days" })
        await last90.click({ signal })
        await expect(last90).toHaveAttribute("aria-pressed", "true")
        await page.waitForLoadState("networkidle")
      },
      ready: (page) => page.getByRole("button", { name: "Last 90 days", pressed: true }),
      frame: PAGE_FRAME,
    },
    {
      name: "tasks-long-title",
      act: async (page, { signal }) => {
        // Retitle the first row, so the long title lands on the first page of the sorted table.
        await openPausedTasks(page, signal)
        await page
          .getByRole("button", { name: /^Edit / })
          .first()
          .click({ signal })
        const dialog = page.getByRole("dialog", { name: "Edit task" })
        await dialog.getByRole("textbox", { name: "Title" }).fill(LONG_TASK_TITLE, { signal })
        await dialog.getByRole("button", { name: /^Save/ }).click({ signal })
        await expect(dialog).toBeHidden()
      },
      ready: (page) => page.getByRole("cell", { name: LONG_TASK_TITLE, exact: true }),
      frame: PAGE_FRAME,
    },
    {
      name: "profile-invalid",
      act: async (page, { signal }) => {
        await openRoute(page, appRoute("settings-profile"), signal)
        await page.getByLabel("Display name").fill("", { signal })
        await page.getByRole("button", { name: "Save profile" }).click({ signal })
        await expect(page.getByLabel("Display name")).toBeFocused()
      },
      ready: (page) => page.getByText("Display name is required."),
      checks: { focus: true },
    },
    {
      name: "profile-long-name",
      act: async (page, { signal }) => {
        await openRoute(page, appRoute("settings-profile"), signal)
        await page.getByLabel("Display name").fill(LONG_NAME, { signal })
        await page.getByRole("button", { name: "Save profile" }).click({ signal })
        await expect(page.getByText("Profile saved")).toBeVisible()
        await expect(page.getByText("Profile saved")).toBeHidden({ timeout: 10_000 })
      },
      ready: (page) => page.getByLabel("Display name"),
      frame: PAGE_FRAME,
    },
  ],
})
