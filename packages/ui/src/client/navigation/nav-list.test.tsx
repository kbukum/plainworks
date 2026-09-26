// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { AnchorHTMLAttributes, ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NavList } from "./nav-list"

afterEach(cleanup)

const ITEMS = [
  { id: "home", label: "Home", href: "/", icon: <svg aria-hidden /> },
  { id: "tasks", label: "Tasks", href: "/tasks", current: true },
  { id: "settings", label: "Settings", href: "/settings" },
] as const

// jsdom only follows hash links, so interaction tests stay in-document.
const HASH_ITEMS = ITEMS.map((item) => ({ ...item, href: `#${item.id}` }))

describe("NavList", () => {
  it("renders a labelled navigation with one current page", async () => {
    const { container } = render(<NavList label="Primary" items={ITEMS} />)

    const nav = screen.getByRole("navigation", { name: "Primary" })
    const links = screen.getAllByRole("link")
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/", "/tasks", "/settings"])
    expect(screen.getByRole("link", { name: "Tasks" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("link", { name: "Home" }).hasAttribute("aria-current")).toBe(false)
    expect(nav.querySelectorAll("li")).toHaveLength(3)
    await expectNoAxeViolations(container)
  })

  it("routes links through the host's link render and reports activation", async () => {
    const onNavigate = vi.fn()
    function renderLink(props: AnchorHTMLAttributes<HTMLAnchorElement>): ReactElement {
      return <a {...props} data-host-link="true" />
    }
    render(
      <NavList
        label="Primary"
        items={HASH_ITEMS}
        renderLink={renderLink}
        onNavigate={onNavigate}
      />,
    )

    const settings = screen.getByRole("link", { name: "Settings" })
    expect(settings.getAttribute("data-host-link")).toBe("true")
    await userEvent.setup().click(settings)
    expect(onNavigate).toHaveBeenCalledOnce()
  })

  it("is reachable in order with the keyboard", async () => {
    render(<NavList label="Primary" items={ITEMS} />)
    const user = userEvent.setup()

    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Home" }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Tasks" }))
  })
})
