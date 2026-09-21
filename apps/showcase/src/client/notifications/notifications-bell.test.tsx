// @vitest-environment jsdom

import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { createQueryClient, prefetchQuery } from "@plainworks/query"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { NOTIFICATION_LIST_PARAMS } from "../../app/constants"
import { notificationListPlan } from "../../app/notification-read"
import { HttpClientProvider } from "../http-client"
import { RouterProvider } from "../router"
import { NotificationsBell } from "./notifications-bell"

// The shell's unread indicator reads the one notifications query cache — the same key the feed
// mutates — so it never becomes a second source of truth. Seed 11 seeds 11 unread of 20.

const handle = createMockServerHandle({ seed: 11 })
const UNREAD = 11

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
beforeEach(() => installMatchMedia())
afterEach(() => {
  cleanup()
  handle.server.resetHandlers()
  handle.api.reset()
})
afterAll(() => handle.server.close())

async function renderBell(options: { prefetch?: boolean } = {}) {
  const { prefetch = true } = options
  const httpClient = createHttpClient({ baseUrl: "http://showcase.test" })
  const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } })
  if (prefetch) {
    await prefetchQuery(queryClient, notificationListPlan(httpClient, NOTIFICATION_LIST_PARAMS))
  }
  const ui = render(
    <QueryClientProvider client={queryClient}>
      <HttpClientProvider client={httpClient}>
        <RouterProvider initialPath="/">
          <NotificationsBell />
        </RouterProvider>
      </HttpClientProvider>
    </QueryClientProvider>,
  )
  return { httpClient, queryClient, ...ui }
}

describe("notifications bell", () => {
  it("announces the unread count read from the shared cache", async () => {
    await renderBell()
    expect(
      await screen.findByRole("link", { name: `Notifications, ${UNREAD} unread` }),
    ).toBeDefined()
    expect(screen.getByText("9+")).toBeDefined()
  })

  it("navigates to the feed when pressed", async () => {
    const user = userEvent.setup()
    await renderBell()
    const link = await screen.findByRole("link", { name: /Notifications/ })
    expect(link.getAttribute("href")).toBe("/notifications")
    await user.click(link)
    expect(window.location.pathname).toBe("/notifications")
  })

  it("drops the count when the inbox has no unread items", async () => {
    const httpClient = createHttpClient({ baseUrl: "http://showcase.test" })
    const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } })
    await prefetchQuery(queryClient, notificationListPlan(httpClient, NOTIFICATION_LIST_PARAMS))
    for (const row of handle.api.stores.notifications.getAll()) {
      if (!row.read) {
        const index = handle.api.stores.notifications.findIndex((n) => n.id === row.id)
        handle.api.stores.notifications.update(index, { ...row, read: true })
      }
    }
    await queryClient.invalidateQueries()
    render(
      <QueryClientProvider client={queryClient}>
        <HttpClientProvider client={httpClient}>
          <RouterProvider initialPath="/">
            <NotificationsBell />
          </RouterProvider>
        </HttpClientProvider>
      </QueryClientProvider>,
    )
    const bell = await screen.findByRole("link", { name: "Notifications" })
    await waitFor(() => expect(bell.getAttribute("aria-label")).toBe("Notifications"))
  })

  it("reports an unavailable unread count when the initial query fails", async () => {
    handle.server.use(
      http.get("*/api/notifications", () => new HttpResponse(null, { status: 500 })),
    )

    await renderBell({ prefetch: false })

    expect(await screen.findByRole("link", { name: "Notifications unavailable" })).toBeDefined()
    expect(screen.getByText("!")).toBeDefined()
  })

  it("carries no axe violations", async () => {
    const { container } = await renderBell()
    await screen.findByRole("link", { name: /Notifications/ })
    await expectNoAxeViolations(container)
  })
})
