// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
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
    // The final entry has no href → current page, not a link.
    expect(screen.queryByRole("link", { name: "INV-42" })).toBeNull()
    const current = screen.getByText("INV-42")
    expect(current.getAttribute("aria-current")).toBe("page")
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
    // Last entry is current regardless of its href.
    expect(screen.queryByRole("link", { name: "Now" })).toBeNull()
    expect(screen.getByText("Now").getAttribute("aria-current")).toBe("page")
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
