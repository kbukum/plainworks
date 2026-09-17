// @vitest-environment jsdom
import { cleanup, type RenderResult, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import axe from "axe-core"
import { type AnchorHTMLAttributes, createElement, type ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  usePathname: () => "/tasks",
  useRouter: () => ({ push }),
}))

// The Next runtime is not mounted in the test host, so `next/link` stands in as a plain anchor —
// the section nav's destinations are what this test asserts, not Next's client transition.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { href, ...rest }, children),
}))

const { AppShell } = await import("./app-shell")
const { createLiveTasksSource } = await import("./sources")
const { SessionProvider } = await import("./session")

// The app chrome binds to the host's own router: the section nav is a navigation landmark of real
// anchors, and a plain breadcrumb click routes through `router.push` rather than a full reload —
// the `ui` breadcrumb `render` seam driven by a genuinely different router than the showcase's.

afterEach(() => {
  cleanup()
  push.mockClear()
})

function renderShell(): RenderResult {
  return render(
    <SessionProvider
      initialSnapshot={{
        status: "authenticated",
        identity: { subject: "user-123", claims: { name: "Ada" } },
      }}
    >
      <AppShell liveSource={createLiveTasksSource()}>
        <h1>Tasks</h1>
      </AppShell>
    </SessionProvider>,
  )
}

describe("app shell", () => {
  it("exposes the section nav as a navigation landmark with real destinations", () => {
    renderShell()
    const nav = screen.getByRole("navigation", { name: "Sections" })
    expect(nav).toBeDefined()
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("href")).toBe("/")
    expect(screen.getByRole("link", { name: "Tasks" }).getAttribute("href")).toBe("/tasks")
  })

  it("routes a breadcrumb click through the host router instead of a full reload", async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(screen.getByRole("link", { name: "Home" }))
    expect(push).toHaveBeenCalledWith("/")
  })

  it("keeps the streamed activity feed in a polite live region", () => {
    const { container } = renderShell()
    const region = container.querySelector("[aria-live='polite']")
    expect(region?.textContent).toContain("Waiting for the first streamed update")
  })

  it("has no detectable accessibility violations", async () => {
    renderShell()
    const results = await axe.run(document.body)
    expect(results.violations).toEqual([])
  })
})
