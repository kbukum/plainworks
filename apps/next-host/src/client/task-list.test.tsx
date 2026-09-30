// @vitest-environment jsdom

import { createHttpClient } from "@plainworks/http"
import { HttpClientProvider } from "@plainworks/http/client"
import { bindMockServerLifecycle } from "@plainworks/mocks/lifecycle"
import { createQueryClient } from "@plainworks/query"
import { QueryProvider } from "@plainworks/query/client"
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { createTestQueryClient } from "@plainworks/testkit/query"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { createDemoBackend } from "../server/mock-dispatch"
import { TaskList } from "./task-list"

// The query-driven list read through the browser HTTP client against the seeded mock backend — the
// same `taskList.options` plan the RSC page prefetches, so the client mounts under the identical
// key. The in-process backend routes through MSW with `onUnhandledRequest: "error"`, so requests
// are intercepted at the network boundary rather than by stubbing `fetch`.

const ORIGIN = "http://next-host.test"
const backend = createDemoBackend({ seed: 7 })

const server = setupServer(http.all(`${ORIGIN}/*`, ({ request }) => backend.dispatch(request)))

bindMockServerLifecycle(server, { hooks: { beforeAll, afterEach, afterAll } })
afterEach(() => {
  cleanup()
})

function renderList() {
  const queryClient = createTestQueryClient(createQueryClient, {
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryProvider client={queryClient}>
      <HttpClientProvider client={createHttpClient({ baseUrl: ORIGIN })}>
        <TaskList />
      </HttpClientProvider>
    </QueryProvider>,
  )
}

const STATUS_LABELS = ["To do", "In progress", "Done", "Blocked"]

describe("task list", () => {
  it("announces the load, then renders the seeded tasks with a readable status", async () => {
    renderList()
    expect(screen.getByRole("status", { name: "Loading tasks" })).toBeDefined()
    const table = await screen.findByRole("table", { name: "Tasks, highest priority first" })
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      const text = row.textContent ?? ""
      expect(STATUS_LABELS.some((label) => text.includes(label))).toBe(true)
    }
  })

  it("shows a failure the user can retry", async () => {
    const user = userEvent.setup()
    server.use(
      http.get(`${ORIGIN}/api/tasks`, () => new HttpResponse(null, { status: 500 }), {
        once: true,
      }),
    )
    renderList()
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Tasks are unavailable")
    await user.click(within(alert).getByRole("button", { name: "Try again" }))
    expect(
      await screen.findByRole("table", { name: "Tasks, highest priority first" }),
    ).toBeDefined()
  })

  it("has no detectable accessibility violations once loaded", async () => {
    const { container } = renderList()
    await screen.findByRole("table")
    await expectNoAxeViolations(container)
  })
})
