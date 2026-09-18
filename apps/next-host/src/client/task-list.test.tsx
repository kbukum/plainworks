// @vitest-environment jsdom
import { createQueryClient } from "@plainworks/query"
import { QueryProvider } from "@plainworks/query/client"
import { cleanup, render, screen } from "@testing-library/react"
import axe from "axe-core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createDemoBackend } from "../server/mock-dispatch"
import { HttpClientProvider } from "./http-client"
import { TaskList } from "./task-list"

// The query-driven list read through the browser HTTP client against the seeded mock backend — the
// same `taskListPlan` the RSC page prefetches, so the client mounts under the identical key. The
// in-process backend stands in for the network by routing the browser `fetch` through `dispatch`;
// the rendered table must also be accessible.

const ORIGIN = "http://next-host.test"

beforeEach(() => {
  const backend = createDemoBackend({ seed: 7 })
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) =>
    backend.dispatch(new Request(input, init)),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderList() {
  const queryClient = createQueryClient()
  return render(
    <QueryProvider client={queryClient}>
      <HttpClientProvider origin={ORIGIN}>
        <TaskList />
      </HttpClientProvider>
    </QueryProvider>,
  )
}

describe("task list", () => {
  it("renders the seeded task rows read through the browser query", async () => {
    renderList()
    await screen.findByRole("table", { name: "Tasks, highest priority first" })
    const rows = await screen.findAllByRole("row")
    // The header row plus at least one seeded data row.
    expect(rows.length).toBeGreaterThan(1)
  })

  it("announces the load and its outcome from one mounted polite live region", async () => {
    const { container } = renderList()
    const region = container.querySelector("[aria-live='polite']")
    expect(region?.getAttribute("aria-busy")).toBe("true")
    await screen.findByRole("table")
    expect(region?.getAttribute("aria-busy")).toBe("false")
    expect(region?.contains(screen.getByRole("table"))).toBe(true)
  })

  it("has no detectable accessibility violations once loaded", async () => {
    const { container } = renderList()
    await screen.findByRole("table")
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
