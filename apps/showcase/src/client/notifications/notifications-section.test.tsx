// @vitest-environment jsdom

import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { createQueryClient, prefetchQuery } from "@plainworks/query"
import { deferred, fakeStateSource } from "@plainworks/testkit"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { ThemeProvider } from "@plainworks/theme/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NOTIFICATION_LIST_PARAMS } from "../../app/constants"
import { notificationListPlan } from "../../app/notification-read"
import { ToastProvider } from "../feedback"
import { HttpClientProvider } from "../http-client"
import { SessionProvider } from "../session"
import { NotificationsSection } from "./notifications-section"

// The Notifications catalog proven from the user's vantage over the real kit stack:
// `@plainworks/ui` and `@plainworks/elements` composites, an `@plainworks/http` client against the
// `@plainworks/demo` MSW backend, a hydrated `@plainworks/query` read, and `@plainworks/auth`
// gating for the act-on controls. Seed 11 seeds a 20-item inbox with 11 unread; every assertion is
// a role/label query driven with `user-event`, no real network or timer.

const handle = createMockServerHandle({ seed: 11 })
const TOTAL = 20
const UNREAD = 11
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

async function renderNotifications(options: { authed?: boolean; prefetch?: boolean } = {}) {
  const { authed = true, prefetch = true } = options
  const httpClient = createHttpClient({ baseUrl: "http://showcase.test" })
  const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } })
  if (prefetch) {
    await prefetchQuery(queryClient, notificationListPlan(httpClient, NOTIFICATION_LIST_PARAMS))
  }
  const ui = render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider {...(authed ? { initialSnapshot: AUTHED } : {})}>
        <HttpClientProvider client={httpClient}>
          <ThemeProvider source={fakeStateSource()}>
            <ToastProvider>
              <NotificationsSection />
            </ToastProvider>
          </ThemeProvider>
        </HttpClientProvider>
      </SessionProvider>
    </QueryClientProvider>,
  )
  return { httpClient, queryClient, ...ui }
}

function feed(): HTMLElement {
  return screen.getByRole("list", { name: "Notifications" })
}

describe("notifications section", () => {
  it("renders the server-prefetched feed", async () => {
    await renderNotifications()
    await waitFor(() => expect(within(feed()).getAllByRole("listitem").length).toBe(TOTAL))
    expect(screen.getAllByRole("button", { name: /^Mark read/ }).length).toBe(UNREAD)
  })

  it("filters to unread through the tablist", async () => {
    const user = userEvent.setup()
    await renderNotifications()
    await waitFor(() => expect(within(feed()).getAllByRole("listitem").length).toBe(TOTAL))

    await user.click(screen.getByRole("tab", { name: /Unread/ }))

    await waitFor(() => expect(within(feed()).getAllByRole("listitem").length).toBe(UNREAD))
    const rows = within(feed()).getAllByRole("listitem")
    expect(within(feed()).getAllByRole("button", { name: /^Mark read/ }).length).toBe(rows.length)
  })

  it("marks a notification read optimistically before the request settles", async () => {
    const user = userEvent.setup()
    await renderNotifications()
    await waitFor(() => expect(within(feed()).getAllByRole("listitem").length).toBe(TOTAL))

    // Hold the PATCH open so the assertion observes the in-flight optimistic flip before the final
    // server reconciliation.
    const release = deferred<void>()
    handle.server.use(
      http.patch("*/api/notifications/:id", async ({ params }) => {
        await release.promise
        const store = handle.api.stores.notifications
        const index = store.findIndex((row) => row.id === params.id)
        const current = store.getAll()[index]
        if (current === undefined) throw new Error(`notification ${String(params.id)} not found`)
        const updated = { ...current, read: true }
        store.update(index, updated)
        return HttpResponse.json({ data: updated })
      }),
    )

    await user.click(screen.getAllByRole("button", { name: /^Mark read/ })[0] as HTMLElement)

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /^Mark read/ }).length).toBe(UNREAD - 1),
    )
    release.resolve()
    expect(await screen.findByText("Marked as read")).toBeDefined()
  })

  it("dismisses a notification optimistically", async () => {
    const user = userEvent.setup()
    await renderNotifications()
    await waitFor(() => expect(within(feed()).getAllByRole("listitem").length).toBe(TOTAL))

    const dismissButtons = screen.getAllByRole("button", { name: /^Dismiss notification/ })
    await user.click(dismissButtons[0] as HTMLElement)

    await waitFor(() => expect(within(feed()).getAllByRole("listitem").length).toBe(TOTAL - 1))
    expect(document.activeElement).toBe(
      screen.getAllByRole("button", { name: /^Dismiss notification/ })[0],
    )
    expect(await screen.findByText("Notification dismissed")).toBeDefined()
  })

  it("moves focus to the next unread action when marking a row read", async () => {
    const user = userEvent.setup()
    await renderNotifications()
    await waitFor(() => expect(within(feed()).getAllByRole("listitem").length).toBe(TOTAL))
    await user.click(screen.getByRole("tab", { name: /Unread/ }))
    const markReadButtons = screen.getAllByRole("button", { name: /^Mark read/ })

    await user.click(markReadButtons[0] as HTMLElement)

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /^Mark read/ }).length).toBe(UNREAD - 1),
    )
    expect(document.activeElement).toBe(screen.getAllByRole("button", { name: /^Mark read/ })[0])
  })

  it("marks every notification read in one request", async () => {
    const user = userEvent.setup()
    await renderNotifications()
    await waitFor(() => expect(within(feed()).getAllByRole("listitem").length).toBe(TOTAL))

    const markAll = screen.getByRole("button", { name: "Mark all read" }) as HTMLButtonElement
    await user.click(markAll)

    await waitFor(() =>
      expect(screen.queryAllByRole("button", { name: /^Mark read/ }).length).toBe(0),
    )
    expect(markAll.disabled).toBe(true)
    expect(await screen.findByText("All notifications marked read")).toBeDefined()
  })

  it("hides the act-on controls from a guest", async () => {
    await renderNotifications({ authed: false })
    await waitFor(() => expect(within(feed()).getAllByRole("listitem").length).toBe(TOTAL))

    expect(screen.queryByRole("button", { name: "Mark all read" })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Mark read/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Dismiss notification/ })).toBeNull()
  })

  it("rolls back and surfaces an error when a mark-read fails", async () => {
    const user = userEvent.setup()
    await renderNotifications()
    await waitFor(() => expect(within(feed()).getAllByRole("listitem").length).toBe(TOTAL))

    handle.server.use(
      http.patch("*/api/notifications/:id", () => new HttpResponse(null, { status: 500 })),
    )

    await user.click(screen.getAllByRole("button", { name: /^Mark read/ })[0] as HTMLElement)

    expect(await screen.findByText("That notification could not be updated")).toBeDefined()
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /^Mark read/ }).length).toBe(UNREAD),
    )
  })

  it("shows the caught-up empty state when the inbox is empty", async () => {
    handle.server.use(
      http.get("*/api/notifications", () =>
        HttpResponse.json({
          data: [],
          pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
        }),
      ),
    )
    await renderNotifications({ prefetch: false })
    expect(await screen.findByText("You're all caught up")).toBeDefined()
  })

  it("renders an error state when the feed query fails", async () => {
    handle.server.use(
      http.get("*/api/notifications", () => new HttpResponse(null, { status: 500 })),
    )
    await renderNotifications({ prefetch: false })
    expect(await screen.findByText("Notifications are unavailable")).toBeDefined()
  })

  it("carries no axe violations", async () => {
    const { container } = await renderNotifications()
    await waitFor(() => expect(within(feed()).getAllByRole("listitem").length).toBe(TOTAL))
    await expectNoAxeViolations(container)
  })
})
