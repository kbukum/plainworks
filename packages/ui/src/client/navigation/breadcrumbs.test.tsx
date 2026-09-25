// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { Breadcrumbs } from "./breadcrumbs"

afterEach(cleanup)

describe("Breadcrumbs", () => {
  it("links every entry except the current page and labels the landmark", async () => {
    const { container } = render(
      <Breadcrumbs
        label="You are here"
        items={[
          { label: "Home", href: "/" },
          { label: "Invoices", href: "/invoices" },
          { label: "INV-42" },
        ]}
      />,
    )

    const nav = screen.getByRole("navigation", { name: "You are here" })
    expect(nav).toBeDefined()
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/")
    expect(screen.getByRole("link", { name: "Invoices" })).toBeDefined()
    // The final entry is the current page: a disabled link with no destination.
    const current = screen.getByRole("link", { name: "INV-42", current: "page" })
    expect(current.getAttribute("aria-disabled")).toBe("true")
    expect(current.hasAttribute("href")).toBe(false)
    await expectNoAxeViolations(container)
  })

  it("renders an injected host link that receives the destination", async () => {
    // A stand-in for a router link (Next.js `<Link>`, a typed-router link): a component that must
    // be what actually renders, and must receive the entry's destination.
    function HostLink({
      href,
      children,
      ...props
    }: {
      readonly href?: string
      readonly children?: ReactNode
    }): ReactElement {
      return (
        <a data-host-link="true" href={href} {...props}>
          {children}
        </a>
      )
    }

    const { container } = render(
      <Breadcrumbs
        items={[{ label: "Home", href: "/", render: <HostLink /> }, { label: "INV-42" }]}
      />,
    )

    const link = screen.getByRole("link", { name: "Home" })
    expect(link.getAttribute("data-host-link")).toBe("true")
    expect(link.getAttribute("href")).toBe("/")
    await expectNoAxeViolations(container)
  })

  it("renders the current page when the last entry still carries an href", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Now", href: "/now" },
        ]}
      />,
    )
    // Last entry is current regardless of its href, so it never navigates.
    const current = screen.getByRole("link", { name: "Now", current: "page" })
    expect(current.hasAttribute("href")).toBe(false)
  })

  it("renders an intermediate entry without an href as plain text, never a second current page", () => {
    render(
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: "Group" }, { label: "INV-42" }]}
      />,
    )
    // The href-less middle entry is plain text: not a link and not a second aria-current page.
    expect(screen.queryByRole("link", { name: "Group" })).toBeNull()
    expect(screen.getByText("Group").getAttribute("aria-current")).toBeNull()
    expect(
      screen.getAllByText((_, el) => el?.getAttribute("aria-current") === "page"),
    ).toHaveLength(1)
    expect(screen.getByText("INV-42").getAttribute("aria-current")).toBe("page")
  })
})
