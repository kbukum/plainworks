// @vitest-environment jsdom

import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { createQueryClient, prefetchQuery } from "@plainworks/query"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, within } from "@testing-library/react"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { RECENT_ACTIVITY_PARAMS } from "../../app/constants"
import { overviewStatsPlan, revenueTrendPlan } from "../../app/overview-read"
import { taskListPlan } from "../../app/task-read"
import { HttpClientProvider } from "../http-client"
import { OverviewSection } from "./overview-section"

// The Overview dashboard proven from the user's vantage over the real kit stack: three independent
// hydrated `@plainworks/query` reads against the `@plainworks/demo` MSW backend, rendered through
// `@plainworks/ui` display primitives and kit atoms. Every assertion is a role/label query; no real
// network beyond the mock server and no timers.

const handle = createMockServerHandle({ seed: 7 })

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
beforeEach(() => installMatchMedia())
afterEach(() => {
  cleanup()
  handle.server.resetHandlers()
  handle.api.reset()
  vi.unstubAllGlobals()
})
afterAll(() => handle.server.close())

async function renderOverview(
  options: { prefetch?: boolean; retry?: boolean } = {},
): Promise<void> {
  const { prefetch = true, retry = false } = options
  const httpClient = createHttpClient({ baseUrl: "http://showcase.test" })
  const queryClient = createQueryClient({ defaultOptions: { queries: { retry } } })
  if (prefetch) {
    await Promise.all([
      prefetchQuery(queryClient, overviewStatsPlan(httpClient)),
      prefetchQuery(queryClient, revenueTrendPlan(httpClient)),
      prefetchQuery(queryClient, taskListPlan(httpClient, RECENT_ACTIVITY_PARAMS)),
    ])
  }
  render(
    <QueryClientProvider client={queryClient}>
      <HttpClientProvider client={httpClient}>
        <OverviewSection />
      </HttpClientProvider>
    </QueryClientProvider>,
  )
}

describe("overview section", () => {
  it("renders the server-prefetched headline stats, trend, and activity", async () => {
    await renderOverview()

    expect(screen.getByText("Total users")).toBeDefined()
    expect(screen.getByText("Total orders")).toBeDefined()
    expect(screen.getByText("Products")).toBeDefined()
    expect(screen.getByText("Revenue trend")).toBeDefined()

    const trend = screen.getByRole("table", { name: "Revenue by day over the period" })
    expect(within(trend).getAllByRole("row").length).toBeGreaterThan(1)

    const activity = await screen.findByRole("list")
    expect(within(activity).getAllByRole("listitem").length).toBeGreaterThan(0)
  })

  it("shows accessible loading placeholders before the reads resolve", async () => {
    await renderOverview({ prefetch: false })

    expect(screen.getByRole("status", { name: "Loading summary statistics" })).toBeDefined()
    expect(screen.getByRole("status", { name: "Loading revenue trend" })).toBeDefined()
    expect(screen.getByRole("status", { name: "Loading recent activity" })).toBeDefined()
  })

  it("surfaces a typed error when the summary read fails", async () => {
    handle.server.use(
      http.get("*/api/dashboard/overview", () => new HttpResponse(null, { status: 500 })),
    )
    await renderOverview({ prefetch: false })

    expect(await screen.findByText("Summary statistics are unavailable")).toBeDefined()
  })

  it("carries no axe violations", async () => {
    await renderOverview()
    await screen.findByRole("list")
    await expectNoAxeViolations(document.body)
  })
})
