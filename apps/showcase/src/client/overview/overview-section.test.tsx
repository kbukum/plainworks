// @vitest-environment jsdom

import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { createQueryClient, prefetchQuery } from "@plainworks/query"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { OVERVIEW_STATS_KEY, RECENT_ACTIVITY_PARAMS } from "../../app/constants"
import { overviewStatsPlan, productSalesPlan, revenueTrendPlan } from "../../app/overview-read"
import { taskListPlan } from "../../app/task-read"
import { HttpClientProvider } from "../http-client"
import { RouterProvider } from "../router"
import { OverviewSection } from "./overview-section"

// The Overview dashboard proven from the user's vantage over the real kit stack: independent
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
): Promise<ReturnType<typeof createQueryClient>> {
  const { prefetch = true, retry = false } = options
  const httpClient = createHttpClient({ baseUrl: "http://showcase.test" })
  const queryClient = createQueryClient({ defaultOptions: { queries: { retry } } })
  if (prefetch) {
    await Promise.all([
      prefetchQuery(queryClient, overviewStatsPlan(httpClient)),
      prefetchQuery(queryClient, revenueTrendPlan(httpClient)),
      prefetchQuery(queryClient, productSalesPlan(httpClient)),
      prefetchQuery(queryClient, taskListPlan(httpClient, RECENT_ACTIVITY_PARAMS)),
    ])
  }
  render(
    <QueryClientProvider client={queryClient}>
      <HttpClientProvider client={httpClient}>
        <RouterProvider initialPath="/">
          <OverviewSection />
        </RouterProvider>
      </HttpClientProvider>
    </QueryClientProvider>,
  )
  return queryClient
}

describe("overview section", () => {
  it("renders the server-prefetched headline stats, trend, and activity", async () => {
    await renderOverview()

    expect(screen.getByText("Total users")).toBeDefined()
    expect(screen.getByText("Total orders")).toBeDefined()
    expect(screen.getByText("Products")).toBeDefined()
    expect(screen.getByText("Revenue trend")).toBeDefined()
    expect(screen.getByText("Top products")).toBeDefined()

    const trend = screen.getByRole("table", { name: "Revenue by day over the period" })
    expect(within(trend).getAllByRole("row").length).toBeGreaterThan(1)
    expect(screen.getByRole("list", { name: "Sales by product" })).toBeDefined()

    const activity = await screen.findByRole("list", { name: "Recent activity" })
    expect(within(activity).getAllByRole("listitem").length).toBeGreaterThan(0)
    expect(within(activity).getAllByRole("link")[0]?.getAttribute("href")).toBe("/tasks")
  })

  it("shows accessible loading placeholders before the reads resolve", async () => {
    await renderOverview({ prefetch: false })

    expect(screen.getByRole("status", { name: "Loading Total users" })).toBeDefined()
    expect(screen.getByRole("status", { name: "Loading Total orders" })).toBeDefined()
    expect(screen.getByRole("status", { name: "Loading Revenue" })).toBeDefined()
    expect(screen.getByRole("status", { name: "Loading Products" })).toBeDefined()
    expect(screen.getByRole("status", { name: "Loading revenue trend" })).toBeDefined()
    expect(screen.getByRole("status", { name: "Loading top products" })).toBeDefined()
    expect(screen.getByRole("status", { name: "Loading recent activity" })).toBeDefined()
  })

  it("surfaces a typed error when the summary read fails", async () => {
    handle.server.use(
      http.get("*/api/dashboard/overview", () => new HttpResponse(null, { status: 500 })),
    )
    await renderOverview({ prefetch: false })

    expect(
      await screen.findByRole("alert", { name: "Summary statistics are unavailable" }),
    ).toBeDefined()
  })

  it("replaces stale summary data when a background refresh fails", async () => {
    const queryClient = await renderOverview()
    expect(screen.getAllByText(/from last period/)).toHaveLength(3)
    handle.server.use(
      http.get("*/api/dashboard/overview", () => new HttpResponse(null, { status: 500 })),
    )

    await queryClient.invalidateQueries({ queryKey: OVERVIEW_STATS_KEY })

    expect(
      await screen.findByRole("alert", { name: "Summary statistics are unavailable" }),
    ).toBeDefined()
    expect(screen.queryByText(/from last period/)).toBeNull()
  })

  it("hydrates the default range without a duplicate client request", async () => {
    let revenueRequests = 0
    handle.server.use(
      http.get("*/api/dashboard/revenue", ({ request }) => {
        revenueRequests += 1
        const days = Number(new URL(request.url).searchParams.get("days"))
        return HttpResponse.json({
          data: {
            data: Array.from({ length: days }, (_, index) => ({
              date: `2024-01-${String(index + 1).padStart(2, "0")}`,
              value: index + 1,
            })),
            total: days,
            growth: 1,
          },
        })
      }),
    )

    await renderOverview()

    expect(screen.getByRole("button", { name: "Last 14 days" }).getAttribute("aria-pressed")).toBe(
      "true",
    )
    expect(revenueRequests).toBe(1)
  })

  it("re-reads the trend through the query seam when the date range changes", async () => {
    const user = userEvent.setup()
    const requestedDays: number[] = []
    handle.server.use(
      http.get("*/api/dashboard/revenue", ({ request }) => {
        const days = Number(new URL(request.url).searchParams.get("days"))
        requestedDays.push(days)
        return HttpResponse.json({
          data: {
            data: Array.from({ length: days }, (_, index) => ({
              date: new Date(Date.UTC(2024, 0, index + 1)).toISOString(),
              value: index + 1,
            })),
            total: days,
            growth: 1,
          },
        })
      }),
    )
    await renderOverview()

    await user.click(screen.getByRole("button", { name: "Last 30 days" }))

    const trend = screen.getByRole("table", { name: "Revenue by day over the period" })
    expect(await within(trend).findAllByRole("row")).toHaveLength(31)
    expect(requestedDays).toEqual([14, 30])
  })

  it("shows first-class empty and secondary-visual error states", async () => {
    handle.server.use(
      http.get("*/api/dashboard/revenue", () =>
        HttpResponse.json({ data: { data: [], total: 0, growth: 0 } }),
      ),
      http.get("*/api/dashboard/top-products", () => new HttpResponse(null, { status: 500 })),
    )
    await renderOverview({ prefetch: false })

    expect(await screen.findByText("No revenue data for this period")).toBeDefined()
    expect(await screen.findByText("Product sales are unavailable")).toBeDefined()
  })

  it("rejects malformed product sales at the response boundary", async () => {
    handle.server.use(
      http.get("*/api/dashboard/top-products", () =>
        HttpResponse.json([
          { product: " ", sales: 4 },
          { product: "Invalid count", sales: -1.5 },
        ]),
      ),
    )
    await renderOverview({ prefetch: false })

    expect(await screen.findByText("Product sales are unavailable")).toBeDefined()
    expect(screen.queryByRole("list", { name: "Sales by product" })).toBeNull()
  })

  it("carries no axe violations", async () => {
    await renderOverview()
    await screen.findByRole("list", { name: "Recent activity" })
    await expectNoAxeViolations(document.body)
  })
})
