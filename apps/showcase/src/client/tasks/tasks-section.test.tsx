// @vitest-environment jsdom

import type { Task } from "@plainworks/demo"
import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { createQueryClient, prefetchQuery } from "@plainworks/query"
import type { StreamFrame } from "@plainworks/std"
import { deferred, fakeStreamTransport } from "@plainworks/testkit"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { TASK_LIST_PARAMS } from "../../app/constants"
import { taskListPlan } from "../../app/task-read"
import { HttpClientProvider } from "../http-client"
import { SessionProvider } from "../session"
import { TasksSection } from "./tasks-section"

// The flagship Tasks board proven from the user's vantage over the real kit stack: `@plainworks/ui`
// composites, an `@plainworks/http` client against the `@plainworks/demo` MSW backend, hydrated
// `@plainworks/query` reads, `@plainworks/auth` gating, and a faked channel transport for the live
// stream. Every assertion is a role/label query driven with `user-event`; no real network or timer.

const handle = createMockServerHandle({ seed: 7 })
const AUTHED = {
  status: "authenticated" as const,
  identity: { subject: "user-123", claims: { name: "Ada" } },
}

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
beforeEach(() => installMatchMedia())
afterEach(() => {
  cleanup()
  handle.server.resetHandlers()
  handle.api.reset()
  vi.unstubAllGlobals()
})
afterAll(() => handle.server.close())

async function renderTasks(
  options: {
    authed?: boolean
    stream?: ReturnType<typeof fakeStreamTransport>
    prefetch?: boolean
    retry?: boolean
  } = {},
) {
  const { authed = true, stream = fakeStreamTransport(), prefetch = true, retry = false } = options
  const httpClient = createHttpClient({ baseUrl: "http://showcase.test" })
  const queryClient = createQueryClient({ defaultOptions: { queries: { retry } } })
  if (prefetch) {
    await prefetchQuery(queryClient, taskListPlan(httpClient, TASK_LIST_PARAMS))
  }
  const ui = render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider {...(authed ? { initialSnapshot: AUTHED } : {})}>
        <HttpClientProvider client={httpClient}>
          <TasksSection streamFactory={stream.factory} />
        </HttpClientProvider>
      </SessionProvider>
    </QueryClientProvider>,
  )
  return { httpClient, queryClient, ...ui }
}

describe("tasks section", () => {
  it("renders the server-prefetched task list", async () => {
    await renderTasks()
    const table = await screen.findByRole("table")
    await waitFor(() => expect(table.querySelectorAll("tbody tr").length).toBe(8))
  })

  it("sorts when a column header is activated", async () => {
    const user = userEvent.setup()
    await renderTasks()
    await screen.findByRole("table")

    const titleHeader = screen.getByRole("columnheader", { name: /Title/ })
    expect(titleHeader.getAttribute("aria-sort")).not.toBe("ascending")

    await user.click(within(titleHeader).getByRole("button"))
    await waitFor(() => expect(titleHeader.getAttribute("aria-sort")).toBe("ascending"))
  })

  it("pages through the list", async () => {
    const user = userEvent.setup()
    await renderTasks()
    await screen.findByRole("table")

    await user.click(screen.getByRole("button", { name: "Go to next page" }))
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Go to page 2/ }).getAttribute("aria-current"),
      ).toBe("page"),
    )
  })

  it("creates a task through the optimistic mutation", async () => {
    const user = userEvent.setup()
    await renderTasks()
    await screen.findByRole("table")

    await user.click(await screen.findByRole("button", { name: "New task" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByRole("textbox", { name: "Title" }), "Ship the showcase")
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Priority" }), "high")
    await user.click(within(dialog).getByRole("button", { name: "Create task" }))

    expect(await screen.findByRole("cell", { name: "Ship the showcase" })).toBeDefined()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("rolls back and surfaces an error when a create fails", async () => {
    const user = userEvent.setup()
    await renderTasks()
    await screen.findByRole("table")

    await user.click(await screen.findByRole("button", { name: "New task" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByRole("textbox", { name: "Title" }), "Doomed task")

    // A bodyless 500 fails the create fast and deterministically; the JSON-bodied error gate stalls
    // on `Response.body.cancel()` under jsdom/undici, which never happens in a real browser.
    handle.server.use(http.post("*/api/tasks", () => new HttpResponse(null, { status: 500 })))
    await user.click(within(dialog).getByRole("button", { name: "Create task" }))

    expect(await screen.findByText("That change could not be saved")).toBeDefined()
    await waitFor(() => expect(screen.queryByRole("cell", { name: "Doomed task" })).toBeNull())
  })

  it("swaps the provisional row for the persisted one even when a live upsert lands mid-flight", async () => {
    const user = userEvent.setup()
    const stream = fakeStreamTransport()
    const { httpClient, queryClient } = await renderTasks({ stream })
    await screen.findByRole("table")
    await waitFor(() => expect(stream.current).toBeDefined())
    const existing = queryClient
      .getQueryData<{ data: Task[] }>(taskListPlan(httpClient, TASK_LIST_PARAMS).queryKey)
      ?.data.at(0)
    expect(existing).toBeDefined()
    if (existing === undefined) return

    // Hold the create response open so a streamed upsert can write the same cache key between the
    // optimistic apply and the reconcile — the exact interleave that made a non-atomic
    // rollback-then-write leak a permanent ghost `optimistic-N` row.
    const release = deferred<void>()
    handle.server.use(
      http.post("*/api/tasks", async ({ request }) => {
        await release.promise
        const body = (await request.json()) as Record<string, unknown>
        const now = "2024-01-01T00:00:00.000Z"
        return HttpResponse.json({
          data: { id: "task-persisted", createdAt: now, updatedAt: now, ...body },
        })
      }),
    )

    await user.click(await screen.findByRole("button", { name: "New task" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByRole("textbox", { name: "Title" }), "Concurrent create")
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Priority" }), "high")
    await user.click(within(dialog).getByRole("button", { name: "Create task" }))

    const upsert: StreamFrame = {
      type: "task.upserted",
      data: JSON.stringify({
        ...existing,
        title: "Meanwhile, live",
        updatedAt: "2024-01-01T00:00:00.000Z",
      }),
    }
    act(() => {
      stream.current?.open()
      stream.current?.frame(upsert)
    })

    release.resolve()

    await waitFor(() =>
      expect(screen.getAllByRole("cell", { name: "Concurrent create" })).toHaveLength(1),
    )
    expect(screen.getByRole("cell", { name: "Meanwhile, live" })).toBeDefined()
  })

  it("reconciles the provisional row when create fails even if a live upsert lands mid-flight", async () => {
    const user = userEvent.setup()
    const stream = fakeStreamTransport()
    await renderTasks({ stream })
    await screen.findByRole("table")
    await waitFor(() => expect(stream.current).toBeDefined())

    const release = deferred<void>()
    handle.server.use(
      http.post("*/api/tasks", async () => {
        await release.promise
        return new HttpResponse(null, { status: 500 })
      }),
    )

    await user.click(await screen.findByRole("button", { name: "New task" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByRole("textbox", { name: "Title" }), "Failing concurrent")
    await user.click(within(dialog).getByRole("button", { name: "Create task" }))

    const upsert: StreamFrame = {
      type: "task.upserted",
      data: JSON.stringify({
        id: "live-8",
        title: "Meanwhile, live during fail",
        status: "todo",
        priority: "high",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      }),
    }
    act(() => {
      stream.current?.open()
      stream.current?.frame(upsert)
    })

    release.resolve()

    expect(await screen.findByText("That change could not be saved")).toBeDefined()
    await waitFor(() =>
      expect(screen.queryByRole("cell", { name: "Failing concurrent" })).toBeNull(),
    )
  })

  it("denies task management to a guest", async () => {
    await renderTasks({ authed: false })
    await screen.findByRole("table")

    expect(screen.getByText("Sign in to create and edit tasks.")).toBeDefined()
    expect(screen.queryByRole("button", { name: "New task" })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull()
  })

  it("folds a streamed upsert into the list and tears the stream down", async () => {
    const stream = fakeStreamTransport()
    const { httpClient, queryClient, unmount } = await renderTasks({ stream })
    await screen.findByRole("table")

    await waitFor(() => expect(stream.current).toBeDefined())
    const existing = queryClient
      .getQueryData<{ data: Task[] }>(taskListPlan(httpClient, TASK_LIST_PARAMS).queryKey)
      ?.data.at(0)
    expect(existing).toBeDefined()
    if (existing === undefined) return
    const frame: StreamFrame = {
      type: "task.upserted",
      data: JSON.stringify({
        ...existing,
        title: "Streamed upsert",
        updatedAt: "2024-01-01T00:00:00.000Z",
      }),
    }
    act(() => {
      stream.current?.open()
      stream.current?.frame(frame)
    })

    expect(await screen.findByRole("cell", { name: "Streamed upsert" })).toBeDefined()

    unmount()
    stream.assertClosed()
  })

  it("allows user to pause and resume live updates", async () => {
    const user = userEvent.setup()
    const stream = fakeStreamTransport()
    await renderTasks({ stream })
    await screen.findByRole("table")
    await waitFor(() => expect(stream.current).toBeDefined())
    act(() => {
      stream.current?.open()
    })

    const toggle = screen.getByRole("button", { name: /live task updates/i })
    expect(toggle.getAttribute("aria-pressed")).toBe("true")
    expect(toggle.textContent).toContain("Live")

    await user.click(toggle)
    expect(toggle.getAttribute("aria-pressed")).toBe("false")
    expect(toggle.textContent).toContain("Paused")

    // While paused, streamed frames do not update the table
    const frame: StreamFrame = {
      type: "task.upserted",
      data: JSON.stringify({
        id: "live-paused",
        title: "Paused task update",
        status: "todo",
        priority: "low",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      }),
    }
    act(() => {
      stream.current?.frame(frame)
    })
    expect(screen.queryByRole("cell", { name: "Paused task update" })).toBeNull()

    // Resume updates
    await user.click(toggle)
    expect(toggle.getAttribute("aria-pressed")).toBe("true")
  })

  it("filters tasks through the FilterBar", async () => {
    const user = userEvent.setup()
    await renderTasks()
    await screen.findByRole("table")

    await user.click(screen.getByRole("button", { name: "Add filter" }))
    const input = await screen.findByRole("textbox", { name: "Value" })
    await user.type(input, "Non-existent task title query")

    await waitFor(() => {
      expect(screen.getByText("No results")).toBeDefined()
    })
  })

  it("renders an error callout when the task list query fails", async () => {
    handle.server.use(http.get("*/api/tasks", () => new HttpResponse(null, { status: 500 })))
    await renderTasks({ prefetch: false })
    expect(await screen.findByText("Tasks are unavailable")).toBeDefined()
  })

  it("carries no axe violations with open dialog", async () => {
    const user = userEvent.setup()
    const { container } = await renderTasks()
    await screen.findByRole("table")
    await user.click(await screen.findByRole("button", { name: "New task" }))
    await screen.findByRole("dialog")
    await expectNoAxeViolations(container)
  })
})
