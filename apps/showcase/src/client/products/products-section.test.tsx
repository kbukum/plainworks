// @vitest-environment jsdom

import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { HttpClientProvider } from "@plainworks/http/client"
import { bindMockServerLifecycle } from "@plainworks/mocks/lifecycle"
import { createQueryClient } from "@plainworks/query"
import { prefetchQuery } from "@plainworks/query/hydration"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { createTestQueryClient, TestQueryClientProvider } from "@plainworks/testkit/query"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PRODUCT_LIST_PARAMS } from "../../neutral/constants"
import { productList } from "../../neutral/lists"
import { ProductsSection } from "./products-section"

// The Products catalog proven from the user's vantage: real `@plainworks/ui` composites over an
// `@plainworks/http` client against the `@plainworks/demo` MSW backend, with a hydrated
// `@plainworks/query` read. Assertions query by role/label and drive with `user-event`; no real
// network or timer.

const handle = createMockServerHandle({ seed: 5 })

bindMockServerLifecycle(handle.server, { hooks: { beforeAll, afterEach, afterAll } })
beforeEach(() => installMatchMedia())
afterEach(() => {
  cleanup()
  handle.api.reset()
  vi.unstubAllGlobals()
})

async function renderProducts(options: { prefetch?: boolean } = {}) {
  const { prefetch = true } = options
  const httpClient = createHttpClient({ baseUrl: "http://showcase.test" })
  const queryClient = createTestQueryClient(createQueryClient, {
    defaultOptions: { queries: { retry: false } },
  })
  if (prefetch) {
    await prefetchQuery(queryClient, productList.options(httpClient, PRODUCT_LIST_PARAMS))
  }
  const ui = render(
    <TestQueryClientProvider client={queryClient}>
      <HttpClientProvider client={httpClient}>
        <ProductsSection />
      </HttpClientProvider>
    </TestQueryClientProvider>,
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

  it("opens the detail overlay for a product", async () => {
    const user = userEvent.setup()
    await renderProducts()
    await screen.findByRole("list", { name: "Product results" })

    await user.click(screen.getAllByRole("button", { name: /^View/ })[0] as HTMLElement)
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Stock on hand")).toBeDefined()
    expect(within(dialog).getByText("Availability")).toBeDefined()
  })

  it("shows a failure the user can retry when the products query fails", async () => {
    const user = userEvent.setup()
    handle.server.use(
      http.get("*/api/products", () => new HttpResponse(null, { status: 500 }), { once: true }),
    )
    await renderProducts({ prefetch: false })

    const failure = await screen.findByRole("alert")
    expect(within(failure).getByText("Products are unavailable")).toBeDefined()
    await user.click(within(failure).getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("list", { name: "Product results" })).toBeDefined()
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
