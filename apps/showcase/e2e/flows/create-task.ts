import { defineFlow } from "@plainworks/testkit/playwright"
import { openPausedTasks } from "../support/app"

const TITLE = "Verify flagship journeys"

/** Create a task from the board: the board, the empty dialog, the filled form, the new row. */
export const createTaskFlow = defineFlow({
  name: "create-task",
  covers: [
    "apps/showcase/e2e/flows/create-task.ts",
    "apps/showcase/src/client/tasks/**",
    "apps/showcase/src/neutral/tasks/**",
    "packages/ui/src/client/{data-table,forms,overlays,list,feedback}/**",
  ],
  checkpoints: [
    {
      name: "board",
      act: (page, { signal }) => openPausedTasks(page, signal),
      ready: (page) => page.getByRole("table", { name: /Tasks/ }),
      docs: "tasks-board",
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
      docs: "new-task",
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
