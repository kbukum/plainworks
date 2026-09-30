// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { ListLayout } from "./list-layout"

afterEach(cleanup)

function renderLayout(activeFilters = 0) {
  return render(
    <main>
      <h1>Orders</h1>
      <ListLayout
        labels={{ filters: "Order filters" }}
        activeFilters={activeFilters}
        filtersIcon={<svg aria-hidden="true" data-testid="filters-icon" />}
        search={<input aria-label="Search orders" />}
        filters={<input type="checkbox" aria-label="Shipped" />}
      >
        <table aria-label="Orders" />
      </ListLayout>
    </main>,
  )
}

describe("ListLayout", () => {
  it("keeps search beside the results and the filters in a labelled aside", async () => {
    const { container } = renderLayout()

    expect(screen.getByRole("textbox", { name: "Search orders" })).toBeDefined()
    const aside = screen.getByRole("complementary", { name: "Order filters" })
    expect(within(aside).getByRole("checkbox", { name: "Shipped" })).toBeDefined()
    expect(screen.getByRole("table", { name: "Orders" })).toBeDefined()
    await expectNoAxeViolations(container)
  })

  it("offers the filters in a drawer that names how many are active", async () => {
    renderLayout(2)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "Filters, 2 active" }))
    const drawer = await screen.findByRole("dialog", { name: "Order filters" })
    expect(within(drawer).getByRole("checkbox", { name: "Shipped" })).toBeDefined()
  })

  it("does not mount a second copy of the filters until the drawer opens", () => {
    renderLayout()
    expect(screen.getAllByRole("checkbox", { name: "Shipped" })).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Filters" })).toBeDefined()
  })

  it("shows the injected filters icon and takes translated labels", () => {
    render(
      <ListLayout
        labels={{
          filters: "Filtres",
          filtersButton: "Filtrer",
          activeFilters: (count) => `Filtrer, ${count} actifs`,
        }}
        activeFilters={1}
        filtersIcon={<svg aria-hidden="true" data-testid="filters-icon" />}
        search={null}
        filters={null}
      >
        <p>Results</p>
      </ListLayout>,
    )
    const button = screen.getByRole("button", { name: "Filtrer, 1 actifs" })
    expect(within(button).getByTestId("filters-icon")).toBeDefined()
    expect(screen.getByRole("complementary", { name: "Filtres" })).toBeDefined()
  })

  it("moves the filters from a drawer to a side column by its own width", () => {
    const { container } = renderLayout()
    const root = container.querySelector("main > div")
    expect(root?.className).toContain("@container/list")
    expect(root?.firstElementChild?.className).toContain("@4xl/list:grid-cols-")
  })
})
