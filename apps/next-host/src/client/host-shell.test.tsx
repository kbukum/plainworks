// @vitest-environment jsdom
import type { SessionSnapshot } from "@plainworks/auth/session"
import type { StateSource } from "@plainworks/std/seam"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { fakeStateSource } from "@plainworks/testkit/fakes"
import { ThemeProvider } from "@plainworks/theme/client"
import { DEFAULT_THEME, type ThemePreference } from "@plainworks/theme/preference"
import { cleanup, type RenderResult, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const push = vi.fn()
let pathname = "/tasks"

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}))

const { HostShell } = await import("./host-shell")
const { createLiveTasksSource, createThemeSource } = await import("./sources")
const { SessionProvider } = await import("./session")

// The app frame binds the kit's shell to the host's own router: navigation and breadcrumb links are
// real anchors whose plain clicks route through `router.push`, the same link seam the showcase
// drives with its history router.

const AUTHENTICATED: SessionSnapshot = {
  status: "authenticated",
  identity: { subject: "user-123", claims: { name: "Ada" } },
}

beforeEach(() => {
  installMatchMedia()
})

afterEach(() => {
  cleanup()
  push.mockClear()
  pathname = "/tasks"
})

function renderShell(
  session: SessionSnapshot = AUTHENTICATED,
  themeSource: StateSource<ThemePreference> = createThemeSource(),
): RenderResult {
  return render(
    <ThemeProvider source={themeSource} initialTheme={DEFAULT_THEME}>
      <SessionProvider initialSnapshot={session}>
        <HostShell liveSource={createLiveTasksSource()}>
          <p>Page content</p>
        </HostShell>
      </SessionProvider>
    </ThemeProvider>,
  )
}

function sectionsNav(): HTMLElement {
  return screen.getByRole("navigation", { name: "Primary" })
}

describe("host shell", () => {
  it("lists the sections as real links and marks the current page", () => {
    renderShell()
    const overview = within(sectionsNav()).getByRole("link", { name: "Overview" })
    const tasks = within(sectionsNav()).getByRole("link", { name: "Tasks" })
    expect(overview.getAttribute("href")).toBe("/")
    expect(tasks.getAttribute("href")).toBe("/tasks")
    expect(tasks.getAttribute("aria-current")).toBe("page")
    expect(overview.getAttribute("aria-current")).toBeNull()
  })

  it("routes a section link click through the host router instead of a full reload", async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(within(sectionsNav()).getByRole("link", { name: "Overview" }))
    expect(push).toHaveBeenCalledWith("/")
  })

  it("titles the page from the route and names the main landmark after it", () => {
    renderShell()
    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeDefined()
    expect(screen.getByRole("main", { name: "Tasks" }).textContent).toContain("Page content")
  })

  it("shows a breadcrumb trail below the top level that routes through the host router", async () => {
    const user = userEvent.setup()
    renderShell()
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" })
    await user.click(within(trail).getByRole("link", { name: "Overview" }))
    expect(push).toHaveBeenCalledWith("/")
  })

  it("omits the breadcrumb trail on the overview", () => {
    pathname = "/"
    renderShell()
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull()
  })

  it("keeps the color mode and account controls in the header", () => {
    renderShell()
    const banner = screen.getByRole("banner")
    expect(within(banner).getByRole("button", { name: "Color mode: System" })).toBeDefined()
    expect(within(banner).getByRole("button", { name: "Signed in as Ada" })).toBeDefined()
  })

  it("announces a color mode that could not be saved", async () => {
    const user = userEvent.setup()
    const themeSource = fakeStateSource<ThemePreference>({
      initial: DEFAULT_THEME,
      setError: new Error("write failed"),
    })
    renderShell(AUTHENTICATED, themeSource)
    expect(screen.queryByRole("alert")).toBeNull()

    await user.click(screen.getByRole("button", { name: "Color mode: System" }))
    await user.click(await screen.findByRole("menuitemradio", { name: "Dark" }))

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe("The color mode could not be changed. Try again.")
    expect(screen.getByRole("button", { name: "Color mode: System" })).toBeDefined()
  })

  it("offers sign in to a guest", () => {
    renderShell({ status: "unauthenticated", identity: null })
    expect(
      within(screen.getByRole("banner")).getByRole("button", { name: "Sign in" }),
    ).toBeDefined()
  })

  it("keeps the streamed activity feed in a polite live region the reader can pause", async () => {
    const user = userEvent.setup()
    const { container } = renderShell()
    const feed = screen.getByRole("region", { name: "Live activity" })
    expect(within(feed).getByText("Waiting for the first streamed update…")).toBeDefined()
    expect(container.querySelector("[aria-live='polite']")).not.toBeNull()

    await user.click(within(feed).getByRole("button", { name: "Pause updates" }))
    expect(within(feed).getByRole("button", { name: "Resume updates" })).toBeDefined()
    expect(container.querySelector("[aria-live='off']")).not.toBeNull()

    await user.click(within(feed).getByRole("button", { name: "Resume updates" }))
    expect(container.querySelector("[aria-live='polite']")).not.toBeNull()
  })

  it("has no detectable accessibility violations", async () => {
    renderShell()
    await expectNoAxeViolations(document.body)
  })
})
