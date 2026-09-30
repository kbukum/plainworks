import { defineFlow, pressWithKeyboard } from "@plainworks/testkit/playwright"
import { expect } from "@playwright/test"
import { appRoute, openPausedTasks, openRoute } from "../support/app"

/**
 * Every dialog of the app, open from the keyboard over its page, including the command palette.
 * Dialogs also run on the short landscape phone, where a tall one must scroll inside the viewport.
 */
export const dialogsFlow = defineFlow({
  name: "dialogs",
  covers: [
    "apps/showcase/e2e/flows/dialogs.ts",
    "apps/showcase/src/client/{command,tasks,orders,products,users}/**",
    "packages/ui/src/client/{overlays,forms,display}/**",
    "packages/elements/src/**",
  ],
  extraDevices: ["landscape"],
  checkpoints: [
    {
      name: "command-palette",
      act: async (page, { signal }) => {
        await openRoute(page, appRoute("overview"), signal)
        await page.keyboard.press("ControlOrMeta+k")
      },
      ready: (page) => page.getByRole("combobox", { name: "Command menu" }),
      checks: { focus: true },
      docs: "command-palette",
    },
    {
      name: "command-palette-no-results",
      act: (page, { signal }) =>
        page.getByRole("combobox", { name: "Command menu" }).fill("zzzz-nothing", { signal }),
      ready: (page) => page.getByText("No matching commands."),
      checks: { focus: true },
    },
    {
      name: "task-new",
      act: async (page, { signal }) => {
        await openPausedTasks(page, signal)
        await pressWithKeyboard(page.getByRole("button", { name: "New task" }))
      },
      ready: (page) =>
        page.getByRole("dialog", { name: "New task" }).getByRole("textbox", { name: "Title" }),
      checks: { focus: true },
    },
    {
      name: "task-new-invalid",
      act: async (page) => {
        const dialog = page.getByRole("dialog", { name: "New task" })
        await pressWithKeyboard(dialog.getByRole("button", { name: "Create task" }))
        await expect(dialog.getByRole("textbox", { name: "Title" })).toBeFocused()
      },
      ready: (page) =>
        page.getByRole("dialog", { name: "New task" }).locator("[aria-invalid='true']").first(),
      checks: { focus: true },
    },
    {
      name: "task-edit",
      act: async (page, { signal }) => {
        await openPausedTasks(page, signal)
        await pressWithKeyboard(page.getByRole("button", { name: /^Edit / }).first())
      },
      ready: (page) => page.getByRole("dialog", { name: "Edit task" }),
      checks: { focus: true },
    },
    {
      name: "order-detail",
      act: async (page, { signal }) => {
        await openRoute(page, appRoute("orders"), signal)
        await pressWithKeyboard(page.getByRole("button", { name: /^View order/ }).first())
      },
      ready: (page) => page.getByRole("dialog", { name: /Order for/ }),
      checks: { focus: true },
    },
    {
      name: "product-detail",
      act: async (page, { signal }) => {
        await openRoute(page, appRoute("products"), signal)
        await pressWithKeyboard(page.getByRole("button", { name: /^View details/ }).first())
      },
      ready: (page) => page.getByRole("dialog").getByText("Stock on hand"),
      checks: { focus: true },
    },
    {
      name: "user-profile",
      act: async (page, { signal }) => {
        await openRoute(page, appRoute("users"), signal)
        await pressWithKeyboard(page.getByRole("button", { name: /^View profile/ }).first())
      },
      ready: (page) => page.getByRole("dialog").getByText("Member since"),
      checks: { focus: true },
    },
  ],
})
