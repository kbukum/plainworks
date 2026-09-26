// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Page, PageHeader, Section, Toolbar } from "./index"

afterEach(cleanup)

describe("Page", () => {
  it("keeps its width marker when a caller passes conflicting attributes", () => {
    render(<Page width="prose" data-width="full" data-testid="page" />)
    expect(screen.getByTestId("page").getAttribute("data-width")).toBe("prose")
  })

  it("keeps a section named and described even when a caller overrides its ARIA links", () => {
    render(
      <Section
        title="Open orders"
        description="Orders waiting on fulfilment."
        aria-labelledby={undefined}
        aria-describedby="elsewhere"
      />,
    )
    const region = screen.getByRole("region", { name: "Open orders" })
    const description = document.getElementById(region.getAttribute("aria-describedby") ?? "")
    expect(description?.textContent).toBe("Orders waiting on fulfilment.")
  })

  it("composes one page title, its sections, and a toolbar into an accessible outline", async () => {
    const { container } = render(
      <main>
        <Page>
          <PageHeader
            title="Orders"
            description="Review and advance customer orders."
            navigation={<nav aria-label="Breadcrumb">trail</nav>}
            actions={<button type="button">New order</button>}
          />
          <Section title="Open orders" description="Orders waiting on fulfilment.">
            <Toolbar label="Order controls" actions={<button type="button">Export</button>}>
              <input aria-label="Search orders" />
            </Toolbar>
            <p>rows</p>
          </Section>
        </Page>
      </main>,
    )

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1, name: "Orders" })).toBeDefined()
    expect(screen.getByText("Review and advance customer orders.")).toBeDefined()
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeDefined()
    expect(screen.getByRole("button", { name: "New order" })).toBeDefined()

    const region = screen.getByRole("region", { name: "Open orders" })
    expect(region.getAttribute("aria-describedby")).not.toBeNull()
    expect(screen.getByRole("heading", { level: 2, name: "Open orders" })).toBeDefined()

    const toolbar = screen.getByRole("group", { name: "Order controls" })
    expect(toolbar.contains(screen.getByRole("textbox", { name: "Search orders" }))).toBe(true)
    expect(toolbar.contains(screen.getByRole("button", { name: "Export" }))).toBe(true)
    await expectNoAxeViolations(container)
  })

  it("never adds a banner landmark, so it nests safely inside an app shell", () => {
    render(<PageHeader title="Settings" />)
    expect(screen.queryByRole("banner")).toBeNull()
  })

  it("renders a nested section heading at the requested level", () => {
    render(
      <Section title="Billing" headingLevel={3}>
        body
      </Section>,
    )
    expect(screen.getByRole("heading", { level: 3, name: "Billing" })).toBeDefined()
    expect(screen.getByRole("region", { name: "Billing" }).getAttribute("aria-describedby")).toBe(
      null,
    )
  })

  it("bounds content width by the chosen measure and adapts to its container", () => {
    const { container, rerender } = render(<Page>content</Page>)
    const page = container.querySelector('[data-slot="page"]')
    expect(page?.getAttribute("data-width")).toBe("default")
    expect(page?.className).toContain("@container/page")
    rerender(<Page width="prose">content</Page>)
    expect(container.querySelector('[data-slot="page"]')?.getAttribute("data-width")).toBe("prose")
  })

  it("omits empty action and description slots", () => {
    const { container } = render(
      <>
        <PageHeader title="Plain" />
        <Section title="Plain section">body</Section>
        <Toolbar label="Plain toolbar">
          <span>filters</span>
        </Toolbar>
      </>,
    )
    expect(container.querySelector('[data-slot="page-header-actions"]')).toBeNull()
    expect(container.querySelector('[data-slot="section-actions"]')).toBeNull()
    expect(container.querySelector('[data-slot="toolbar-actions"]')).toBeNull()
    expect(container.querySelector("p")).toBeNull()
  })
})
