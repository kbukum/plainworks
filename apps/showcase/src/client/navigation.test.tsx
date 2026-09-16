// @vitest-environment jsdom

import type { AppSnapshot } from "@plainworks/app"
import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { createQueryClient, dehydrateClient, prefetchQuery } from "@plainworks/query"
import { fakeStreamTransport } from "@plainworks/testkit"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import axe from "axe-core"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { AUTH_CAPABILITY_ID, TASK_LIST_PARAMS } from "../app/constants"
import { taskListPlan } from "../app/task-read"
import { buildClientCapabilities } from "./capabilities"
import { Showcase } from "./showcase"
import { createLiveTasksSource, createThemeSource } from "./sources"

// Router-aware navigation through the host's OWN link, injected into the kit's `ui` breadcrumbs via
// the `BreadcrumbEntry.render` seam: clicking the breadcrumb navigates client-side (no full reload)
// and the view updates. The rendered UI must also be accessible — an axe assertion is the floor,
// alongside the role-based queries.

const handle = createMockServerHandle({ seed: 7 })

// A quiet transport: connects but never emits, so no timer runs during the assertions. The shared
// stream double honors the abort seam like a real adapter, tearing down on unmount.
const quietTransport = fakeStreamTransport().factory

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
  window.history.pushState(null, "", "/tasks")
})
afterEach(() => {
  cleanup()
  handle.server.resetHandlers()
  handle.api.reset()
  vi.unstubAllGlobals()
})
afterAll(() => handle.server.close())

async function renderDashboard(options: { snapshot?: AppSnapshot; initialPath?: string } = {}) {
  const { snapshot = { capabilities: {} }, initialPath = "/tasks" } = options
  const httpClient = createHttpClient({ baseUrl: "http://showcase.test" })
  const queryClient = createQueryClient()
  await prefetchQuery(queryClient, taskListPlan(httpClient, TASK_LIST_PARAMS))
  const capabilities = buildClientCapabilities({
    queryClient,
    themeSource: createThemeSource(),
  })
  return render(
    <Showcase
      capabilities={capabilities}
      snapshot={snapshot}
      dehydratedState={dehydrateClient(queryClient, { shouldDehydrateQuery: () => true })}
      httpClient={httpClient}
      liveSource={createLiveTasksSource()}
      initialPath={initialPath}
      transport={quietTransport}
    />,
  )
}

describe("router-aware navigation", () => {
  it("navigates client-side when the breadcrumb link is clicked", async () => {
    const user = userEvent.setup()
    await renderDashboard()

    // Start on the Tasks view (the last breadcrumb is the current page).
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Tasks")
    const home = screen.getByRole("link", { name: "Home" })

    await user.click(home)

    // The click was intercepted and routed client-side: the address bar and the view both moved to
    // the overview without a full navigation.
    expect(window.location.pathname).toBe("/")
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Overview")
  })

  it("navigates to the gated account view when the affordance is activated", async () => {
    const user = userEvent.setup()
    await renderDashboard({
      snapshot: {
        capabilities: {
          [AUTH_CAPABILITY_ID]: { authenticated: true, subject: "user-123", name: "Ada" },
        },
      },
    })

    await user.click(await screen.findByRole("button", { name: "Account settings" }))

    // The affordance has a real destination: the URL and the view both move to the account page.
    expect(window.location.pathname).toBe("/account")
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Account settings")
    expect(
      await screen.findByRole("heading", { level: 2, name: "Manage your account" }),
    ).toBeDefined()
  })

  it("has no detectable accessibility violations", async () => {
    const { container } = await renderDashboard()
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
