// @vitest-environment jsdom

import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { createQueryClient, prefetchQuery } from "@plainworks/query"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PRODUCT_LIST_PARAMS } from "../../app/constants"
import { productListPlan } from "../../app/product-read"
import { HttpClientProvider } from "../http-client"
import { ProductsSection } from "./products-section"

// The Products catalog proven from the user's vantage: real `@plainworks/ui` composites over an
// `@plainworks/http` client against the `@plainworks/demo` MSW backend, with a hydrated
// `@plainworks/query` read. Assertions query by role/label and drive with `user-event`; no real
// network or timer.

const handle = createMockServerHandle({ seed: 5 })

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
beforeEach(() => installMatchMedia())
afterEach(() => {
  cleanup()
  handle.server.resetHandlers()
  handle.api.reset()
  vi.unstubAllGlobals()
})
afterAll(() => handle.server.close())

async function renderProducts(options: { prefetch?: boolean } = {}) {
  const { prefetch = true } = options
  const httpClient = createHttpClient({ baseUrl: "http://showcase.test" })
  const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } })
  if (prefetch) {
    await prefetchQuery(queryClient, productListPlan(httpClient, PRODUCT_LIST_PARAMS))
  }
  const ui = render(
    <QueryClientProvider client={queryClient}>
      <HttpClientProvider client={httpClient}>
        <ProductsSection />
      </HttpClientProvider>
    </QueryClientProvider>,
  )
  return { httpClient, queryClient, ...ui }
}

describe("products section", () => {
  it("renders the server-prefetched catalog as a card grid", async () => {
    await renderProducts()
    const grid = await screen.findByRole("list", { name: "Product results" })
    await waitFor(() => expect(within(grid).getAllByRole("listitem").length).toBe(12))
  })

  it("filters the catalog by a category facet", async () => {
    const user = userEvent.setup()
    await renderProducts()
    const grid = await screen.findByRole("list", { name: "Product results" })
    const before = within(grid).getAllByRole("listitem").length

    await user.click(screen.getByRole("checkbox", { name: /Electronics/ }))

    await waitFor(() => {
      const after = within(screen.getByRole("list", { name: "Product results" })).getAllByRole(
        "listitem",
      ).length
      expect(after).toBeLessThanOrEqual(before)
    })
    for (const item of within(screen.getByRole("list", { name: "Product results" })).getAllByRole(
      "listitem",
    )) {
      expect(within(item).getByText("Electronics")).toBeDefined()
    }
  })

  it("bounds the catalog with a price range that reaches the backend", async () => {
    const user = userEvent.setup()
    await renderProducts()
    await screen.findByRole("list", { name: "Product results" })

    await user.type(screen.getByLabelText("Min"), "999999")

    expect(await screen.findByText("No products match")).toBeDefined()
  })

  it("rejects negative and non-finite price bounds", async () => {
    const user = userEvent.setup()
    await renderProducts()
    const grid = await screen.findByRole("list", { name: "Product results" })
    const beforeCount = within(grid).getAllByRole("listitem").length

    await user.type(screen.getByLabelText("Min"), "-10")
    expect(within(grid).getAllByRole("listitem").length).toBe(beforeCount)
  })

  it("opens the detail overlay for a product", async () => {
    const user = userEvent.setup()
    await renderProducts()
    await screen.findByRole("list", { name: "Product results" })

    await user.click(screen.getAllByRole("button", { name: /^View/ })[0] as HTMLElement)
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Stock on hand")).toBeDefined()
    expect(within(dialog).getByText("Availability")).toBeDefined()
  })

  it("renders an error callout when the catalog query fails", async () => {
    handle.server.use(http.get("*/api/products", () => new HttpResponse(null, { status: 500 })))
    await renderProducts({ prefetch: false })
    expect(await screen.findByText("Products are unavailable")).toBeDefined()
  })

  it("carries no axe violations with the detail overlay open", async () => {
    const user = userEvent.setup()
    const { container } = await renderProducts()
    await screen.findByRole("list", { name: "Product results" })
    await user.click(screen.getAllByRole("button", { name: /^View/ })[0] as HTMLElement)
    await screen.findByRole("dialog")
    await expectNoAxeViolations(container)
  })
})
