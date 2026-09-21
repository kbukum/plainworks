// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ProductSalesVisual } from "./product-sales-visual"

afterEach(cleanup)

describe("ProductSalesVisual", () => {
  it("pairs the visual bars with visible labels and formatted values", async () => {
    const { container } = render(
      <ProductSalesVisual
        products={[
          { product: "Widget Pro", sales: 100 },
          { product: "Essential Pack", sales: 200 },
        ]}
      />,
    )

    const list = screen.getByRole("list", { name: "Sales by product" })
    expect(within(list).getByText("Widget Pro")).toBeDefined()
    expect(within(list).getByText("200")).toBeDefined()
    expect(within(list).getAllByRole("listitem")[0]?.textContent).toContain("Essential Pack")
    expect(container.querySelectorAll("svg[aria-hidden='true']")).toHaveLength(2)
    await expectNoAxeViolations(container)
  })
})
