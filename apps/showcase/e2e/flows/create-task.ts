import { defineFlow } from "@plainworks/testkit/browser"
import { expect, type Page } from "@playwright/test"

const TITLE = "Verify flagship journeys"

/**
 * Open the task board with live updates paused, before any live update lands, so the table shows
 * only seeded tasks. The demo stream's first update comes a few seconds after hydration; if it wins
 * the race, the page reloads and tries again.
 */
async function openPausedBoard(page: Page, signal: AbortSignal): Promise<void> {
  const pause = page.getByRole("button", { name: "Pause live task updates" })
  const resume = page.getByRole("button", { name: "Resume live task updates" })
  // Live task titles end in their sequence number; seeded ones never do.
  const liveTask = page.getByRole("cell", { name: / #\d+$/ })
  await expect(async () => {
    signal.throwIfAborted()
    await page.goto("/tasks")
    // A click before hydration does nothing, so retry it until the toggle answers.
    await expect(async () => {
      await pause.click({ timeout: 2_000 })
      await expect(resume).toBeVisible({ timeout: 500 })
    }).toPass({ timeout: 10_000 })
    await expect(liveTask).toHaveCount(0, { timeout: 0 })
  }).toPass({ timeout: 45_000 })
}

/** Create a task from the board: the board, the empty dialog, the filled form, the new row. */
export const createTaskFlow = defineFlow({
  name: "create-task",
  covers: [
    "apps/showcase/e2e/flows/create-task.ts",
    "apps/showcase/src/client/tasks/**",
    "apps/showcase/src/app/task-*.ts",
    "packages/ui/src/client/{data-table,forms,overlays,list,feedback}/**",
  ],
  checkpoints: [
    {
      name: "board",
      act: (page, { signal }) => openPausedBoard(page, signal),
      ready: (page) => page.getByRole("table", { name: /Tasks/ }),
    },
    {
      name: "new-task",
      act: (page, { signal }) => page.getByRole("button", { name: "New task" }).click({ signal }),
      ready: (page) => page.getByRole("dialog", { name: "New task" }),
    },
    {
      name: "filled",
      act: async (page, { signal }) => {
        const dialog = page.getByRole("dialog", { name: "New task" })
        await dialog.getByRole("textbox", { name: "Title" }).fill(TITLE, { signal })
        await dialog.getByRole("combobox", { name: "Priority" }).selectOption("high", { signal })
      },
      ready: (page) =>
        page.getByRole("dialog", { name: "New task" }).getByRole("button", { name: "Create task" }),
    },
    {
      name: "created",
      act: (page, { signal }) =>
        page
          .getByRole("dialog", { name: "New task" })
          .getByRole("button", { name: "Create task" })
          .click({ signal }),
      ready: (page) => page.getByRole("cell", { name: TITLE, exact: true }),
    },
  ],
})
