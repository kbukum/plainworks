// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { NavList } from "../navigation/nav-list"
import { AppShell, type AppShellProps } from "./app-shell"

afterEach(cleanup)

const ITEMS = [
  { id: "home", label: "Home", href: "#home", current: true },
  { id: "tasks", label: "Tasks", href: "#tasks" },
] as const

function Shell(props: Partial<AppShellProps>) {
  return (
    <AppShell
      brand={<span>acme</span>}
      mainLabel="Home"
      navigation={({ placement, onNavigate, collapsed }) => (
        <NavList
          label={placement === "rail" ? "Primary" : "Sections"}
          items={ITEMS}
          onNavigate={onNavigate}
          collapsed={collapsed}
        />
      )}
      actions={<button type="button">Search</button>}
      {...props}
    >
      <h1>Home</h1>
    </AppShell>
  )
}

describe("AppShell", () => {
  it("lays out banner, rail navigation, and a labelled main landmark", async () => {
    const { container } = render(<Shell />)

    const banner = screen.getByRole("banner")
    expect(within(banner).getByText("acme")).toBeDefined()
    expect(within(banner).getByRole("button", { name: "Search" })).toBeDefined()
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeDefined()
    expect(screen.getByRole("main", { name: "Home" })).toBeDefined()
    await expectNoAxeViolations(container)
  })

  it("keeps page chrome under the header by giving main its own stacking context", () => {
    render(<Shell />)
    expect(screen.getByRole("main").classList.contains("isolate")).toBe(true)
  })

  it("keeps only the navigation trigger in the header when there are no actions", () => {
    render(<Shell actions={undefined} />)
    const banner = screen.getByRole("banner")
    expect(
      within(banner)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Open navigation", "Collapse navigation"])
  })

  it("offers a skip link as the first stop that targets main", async () => {
    render(<Shell />)
    const user = userEvent.setup()

    await user.tab()
    const skip = screen.getByRole("link", { name: "Skip to main content" })
    expect(document.activeElement).toBe(skip)
    expect(skip.getAttribute("href")).toBe(`#${screen.getByRole("main").id}`)
  })

  it("opens the navigation drawer and closes it after a link is chosen", async () => {
    render(<Shell />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "Open navigation" }))
    const drawer = await screen.findByRole("dialog", { name: "Navigation" })
    await user.click(within(drawer).getByRole("link", { name: "Tasks" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("moves focus to main when the navigation key changes, not on first render", () => {
    const { rerender } = render(<Shell navigationKey="/" />)
    expect(document.activeElement).toBe(document.body)

    rerender(<Shell navigationKey="/tasks" mainLabel="Tasks" />)
    expect(document.activeElement).toBe(screen.getByRole("main", { name: "Tasks" }))
  })

  it("moves focus to main on mount when the host mounts it for a navigation", () => {
    render(<Shell navigationKey="/b" mainLabel="Tasks" focusOnMount />)
    expect(document.activeElement).toBe(screen.getByRole("main", { name: "Tasks" }))
  })

  it("takes injected labels", () => {
    render(
      <Shell
        labels={{ skipToContent: "Zum Inhalt", openNavigation: "Menü öffnen", navigation: "Menü" }}
      />,
    )
    expect(screen.getByRole("link", { name: "Zum Inhalt" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Menü öffnen" })).toBeDefined()
  })

  it("collapses the rail to icons and back, keeping every link named", async () => {
    const user = userEvent.setup()
    const { container } = render(<Shell />)
    const toggle = screen.getByRole("button", { name: "Collapse navigation" })
    expect(toggle.getAttribute("aria-expanded")).toBe("true")

    await user.click(toggle)
    const expand = screen.getByRole("button", { name: "Expand navigation" })
    expect(expand.getAttribute("aria-expanded")).toBe("false")
    const rail = screen.getByRole("navigation", { name: "Primary" })
    expect(within(rail).getByRole("link", { name: "Tasks" })).toBeDefined()
    expect(
      container.querySelector('[data-slot="app-shell-rail"]')?.getAttribute("data-collapsed"),
    ).toBe("true")
    await expectNoAxeViolations(container)

    await user.click(expand)
    expect(screen.getByRole("button", { name: "Collapse navigation" })).toBeDefined()
  })

  it("lets the host own the collapsed state", async () => {
    const user = userEvent.setup()
    const changes: boolean[] = []
    render(<Shell collapsed onCollapsedChange={(next) => changes.push(next)} />)
    await user.click(screen.getByRole("button", { name: "Expand navigation" }))
    expect(changes).toEqual([false])
    expect(screen.getByRole("button", { name: "Expand navigation" })).toBeDefined()
  })

  it("puts the rail footer at the bottom of the rail and the drawer", async () => {
    const user = userEvent.setup()
    render(
      <Shell railFooter={({ placement }) => <button type="button">Settings {placement}</button>} />,
    )
    expect(screen.getByRole("button", { name: "Settings rail" })).toBeDefined()
    await user.click(screen.getByRole("button", { name: "Open navigation" }))
    const drawer = await screen.findByRole("dialog", { name: "Navigation" })
    expect(within(drawer).getByRole("button", { name: "Settings drawer" })).toBeDefined()
  })

  it("paints an opaque header so content never shows through it", () => {
    render(<Shell />)
    const banner = screen.getByRole("banner")
    expect(banner.className).toContain("bg-background")
    expect(banner.className).not.toMatch(/bg-background\/|backdrop-blur/)
  })
})
