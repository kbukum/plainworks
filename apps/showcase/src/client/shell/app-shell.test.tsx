// @vitest-environment jsdom

import type { AppSnapshot } from "@plainworks/app"
import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { createQueryClient, dehydrateClient, prefetchQuery } from "@plainworks/query"
import type { StateSource } from "@plainworks/std"
import { deferred, fakeStateSource } from "@plainworks/testkit"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import type { ThemePreference } from "@plainworks/theme"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { AUTH_CAPABILITY_ID, TASK_LIST_PARAMS } from "../../app/constants"
import { taskListPlan } from "../../app/task-read"
import { buildClientCapabilities } from "../capabilities"
import { Showcase } from "../showcase"
import { createThemeSource } from "../sources"

// The shell is the frame every later section renders inside: the section navigation, the active
// state and breadcrumbs it derives from the router, the account menu, the command palette, and the
// responsive collapse to a drawer. These prove that behavior from the user's vantage — role/label
// queries driven with `user-event`, over the real providers — and hold the accessibility floor with
// an axe assertion. jsdom applies no CSS, so both the wide rail and the narrow drawer are present;
// queries are scoped to a specific landmark with `within` rather than relying on responsive
// visibility.

// cmdk (behind the command palette) measures and scrolls its list; jsdom implements neither.
class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = TestResizeObserver
Element.prototype.scrollIntoView = vi.fn()

const handle = createMockServerHandle({ seed: 7 })

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
beforeEach(() => {
  installMatchMedia()
  window.history.pushState(null, "", "/tasks")
})
afterEach(() => {
  cleanup()
  handle.server.resetHandlers()
  handle.api.reset()
  vi.unstubAllGlobals()
})
afterAll(() => handle.server.close())

const AUTHED: AppSnapshot = {
  capabilities: {
    [AUTH_CAPABILITY_ID]: { authenticated: true, subject: "user-123", name: "Ada" },
  },
}

async function renderShell(
  options: {
    snapshot?: AppSnapshot
    initialPath?: string
    themeSource?: StateSource<ThemePreference>
  } = {},
) {
  const { snapshot = AUTHED, initialPath = "/tasks", themeSource = createThemeSource() } = options
  const httpClient = createHttpClient({ baseUrl: "http://showcase.test" })
  const queryClient = createQueryClient()
  await prefetchQuery(queryClient, taskListPlan(httpClient, TASK_LIST_PARAMS))
  const capabilities = buildClientCapabilities({ queryClient, themeSource })
  return render(
    <Showcase
      capabilities={capabilities}
      snapshot={snapshot}
      dehydratedState={dehydrateClient(queryClient, { shouldDehydrateQuery: () => true })}
      initialPath={initialPath}
      httpClient={httpClient}
    />,
  )
}

function railNav(): HTMLElement {
  return screen.getByRole("navigation", { name: "Primary" })
}

describe("app shell", () => {
  it("provides a skip link targeting the main content landmark", async () => {
    await renderShell()
    const skipLink = screen.getByRole("link", { name: "Skip to main content" })
    expect(skipLink).toBeDefined()
    expect(skipLink.getAttribute("href")).toBe("#main-content")
    expect(screen.getByRole("main").getAttribute("id")).toBe("main-content")
  })

  it("moves focus to the section heading on client navigation without stealing focus on mount", async () => {
    const user = userEvent.setup()
    await renderShell({ initialPath: "/overview" })

    const initialHeading = screen.getByRole("heading", { level: 1, name: "Overview" })
    expect(document.activeElement).not.toBe(initialHeading)

    await user.click(within(railNav()).getByRole("link", { name: "Tasks" }))

    const tasksHeading = screen.getByRole("heading", { level: 1, name: "Tasks" })
    expect(document.activeElement).toBe(tasksHeading)
  })

  it("reflects the active section in the title and breadcrumb", async () => {
    await renderShell({ initialPath: "/tasks" })

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Tasks")
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" })
    // The current page is the last crumb; Overview links back to the root.
    expect(within(trail).getByText("Tasks")).toBeDefined()
    expect(within(trail).getByRole("link", { name: "Overview" })).toBeDefined()

    // The active rail link is marked as the current page.
    expect(
      within(railNav()).getByRole("link", { name: "Tasks" }).getAttribute("aria-current"),
    ).toBe("page")
  })

  it("navigates client-side from the rail and moves the active state", async () => {
    const user = userEvent.setup()
    await renderShell({ initialPath: "/tasks" })

    await user.click(within(railNav()).getByRole("link", { name: "Orders" }))

    expect(window.location.pathname).toBe("/orders")
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Orders")
    expect(
      within(railNav()).getByRole("link", { name: "Orders" }).getAttribute("aria-current"),
    ).toBe("page")
  })

  it("navigates client-side from a breadcrumb link", async () => {
    const user = userEvent.setup()
    await renderShell({ initialPath: "/tasks" })

    const trail = screen.getByRole("navigation", { name: "Breadcrumb" })
    await user.click(within(trail).getByRole("link", { name: "Overview" }))

    expect(window.location.pathname).toBe("/")
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Overview")
  })

  it("renders the theme studio in the Settings appearance panel", async () => {
    await renderShell({ initialPath: "/settings/appearance" })

    expect(
      await screen.findByRole("heading", { level: 2, name: "Appearance" }, { timeout: 5_000 }),
    ).toBeDefined()
    expect(screen.getByRole("region", { name: "Theme preview" })).toBeDefined()
  })

  it("keeps reduced motion applied after leaving Settings", async () => {
    const user = userEvent.setup()
    await renderShell({ initialPath: "/settings/appearance" })

    await user.click(await screen.findByRole("radio", { name: /Reduced motion/ }))
    await waitFor(() => expect(document.documentElement.dataset.motion).toBe("reduce"))
    await user.click(within(railNav()).getByRole("link", { name: "Overview" }))

    expect(document.documentElement.dataset.motion).toBe("reduce")
  })

  it("shares optimistic notification updates and rollback with the shell badge", async () => {
    const user = userEvent.setup()
    const unread = handle.api.stores.notifications.getAll().filter((row) => !row.read).length
    const release = deferred<void>()
    handle.server.use(
      http.patch("*/api/notifications/:id", async () => {
        await release.promise
        return new HttpResponse(null, { status: 500 })
      }),
    )
    await renderShell({ initialPath: "/notifications" })
    const bellName = (count: number): string => `Notifications, ${count} unread`
    await screen.findByRole("link", { name: bellName(unread) })

    const [markRead] = await screen.findAllByRole("button", { name: /^Mark read/ })
    if (markRead === undefined) throw new Error("expected an unread notification")
    await user.click(markRead)

    await screen.findByRole("link", { name: bellName(unread - 1) })
    release.resolve()
    await screen.findByText("That notification could not be updated")
    await waitFor(() => expect(screen.getByRole("link", { name: bellName(unread) })).toBeDefined())
  })

  it("announces one theme-source failure from the composed Settings page", async () => {
    const user = userEvent.setup()
    const initial = { mode: "light", colorScheme: "indigo" } as const
    const themeSource = fakeStateSource<ThemePreference>({
      initial,
      setError: new Error("write failed"),
    })
    await renderShell({ initialPath: "/settings/appearance", themeSource })
    const main = screen.getByRole("main")
    await within(main).findByRole("heading", { level: 2, name: "Appearance" })

    await user.click(within(main).getByRole("button", { name: "Dark" }))

    const alerts = await screen.findAllByRole("alert")
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.textContent).toBe(
      "Theme preferences could not be loaded or saved. Try again.",
    )
  })

  it("opens the mobile drawer and navigates from it, then closes", async () => {
    const user = userEvent.setup()
    await renderShell({ initialPath: "/tasks" })

    await user.click(screen.getByRole("button", { name: "Open sections menu" }))
    const drawer = screen.getByRole("navigation", { name: "Sections" })

    await user.click(within(drawer).getByRole("link", { name: "Users" }))

    expect(window.location.pathname).toBe("/users")
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Users")
    // The drawer closes itself after a selection.
    expect(screen.queryByRole("navigation", { name: "Sections" })).toBeNull()
  })

  it("shows the signed-in identity and its gated account action", async () => {
    const user = userEvent.setup()
    await renderShell({ snapshot: AUTHED })

    expect(screen.getByText(/Signed in as/).textContent).toContain("Ada")

    await user.click(screen.getByRole("button", { name: /Signed in as/ }))
    expect(await screen.findByRole("menuitem", { name: "Account settings" })).toBeDefined()
    expect(screen.getByRole("menuitem", { name: "Log out" })).toBeDefined()
  })

  it("hides the gated account action for a guest", async () => {
    const user = userEvent.setup()
    await renderShell({ snapshot: { capabilities: {} } })

    await user.click(screen.getByRole("button", { name: /Signed in as/ }))
    expect(await screen.findByRole("menuitem", { name: "Log out" })).toBeDefined()
    expect(screen.queryByRole("menuitem", { name: "Account settings" })).toBeNull()
  })

  it("opens the command palette on ⌘K and navigates from it", async () => {
    const user = userEvent.setup()
    await renderShell({ initialPath: "/tasks" })

    await user.keyboard("{Meta>}k{/Meta}")
    await screen.findByRole("combobox", { name: "Command menu" })
    await user.click(screen.getByRole("option", { name: /Orders/ }))

    expect(window.location.pathname).toBe("/orders")
  })

  it("has no detectable accessibility violations", async () => {
    const { container } = await renderShell()
    await expectNoAxeViolations(container)
  })
})
