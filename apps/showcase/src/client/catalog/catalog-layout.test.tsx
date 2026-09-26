// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { CatalogLayout } from "./catalog-layout"

afterEach(cleanup)

function renderLayout(activeFilters = 0) {
  return render(
    <main>
      <h1>Orders</h1>
      <CatalogLayout
        filtersLabel="Order filters"
        activeFilters={activeFilters}
        search={<input aria-label="Search orders" />}
        filters={<input type="checkbox" aria-label="Shipped" />}
      >
        <table aria-label="Orders" />
      </CatalogLayout>
    </main>,
  )
}

describe("CatalogLayout", () => {
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
})
