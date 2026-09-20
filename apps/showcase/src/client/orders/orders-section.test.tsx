// @vitest-environment jsdom

import type { Order } from "@plainworks/demo"
import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { createQueryClient, prefetchQuery } from "@plainworks/query"
import { deferred } from "@plainworks/testkit"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ORDER_LIST_PARAMS } from "../../app/constants"
import { orderListPlan } from "../../app/order-read"
import { HttpClientProvider } from "../http-client"
import { SessionProvider } from "../session"
import { OrdersSection } from "./orders-section"

// The Orders catalog proven from the user's vantage over the real kit stack: `@plainworks/ui`
// composites, an `@plainworks/http` client against the `@plainworks/demo` MSW backend, hydrated
// `@plainworks/query` reads, and `@plainworks/auth` gating for the status change. Every assertion
// is a role/label query driven with `user-event`; no real network or timer.

const handle = createMockServerHandle({ seed: 11 })
const AUTHED = {
  status: "authenticated" as const,
  identity: { subject: "user-123", claims: { name: "Ada" } },
}

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
beforeEach(() => installMatchMedia())
afterEach(() => {
  cleanup()
  handle.server.resetHandlers()
  handle.api.reset()
  vi.unstubAllGlobals()
})
afterAll(() => handle.server.close())

async function renderOrders(options: { authed?: boolean; prefetch?: boolean } = {}) {
  const { authed = true, prefetch = true } = options
  const httpClient = createHttpClient({ baseUrl: "http://showcase.test" })
  const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } })
  if (prefetch) {
    await prefetchQuery(queryClient, orderListPlan(httpClient, ORDER_LIST_PARAMS))
  }
  const ui = render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider {...(authed ? { initialSnapshot: AUTHED } : {})}>
        <HttpClientProvider client={httpClient}>
          <OrdersSection />
        </HttpClientProvider>
      </SessionProvider>
    </QueryClientProvider>,
  )
  return { httpClient, queryClient, ...ui }
}

describe("orders section", () => {
  it("renders the server-prefetched orders list", async () => {
    await renderOrders()
    const table = await screen.findByRole("table", { name: /Orders/ })
    await waitFor(() => expect(table.querySelectorAll("tbody tr").length).toBe(8))
  })

  it("filters by status through the faceted panel", async () => {
    const user = userEvent.setup()
    await renderOrders()
    await screen.findByRole("table", { name: /Orders/ })

    await user.click(screen.getByRole("checkbox", { name: /Delivered/ }))

    await waitFor(() => {
      const rows = screen.getAllByRole("row").slice(1)
      const dataRows = rows.filter((row) => within(row).queryAllByRole("cell").length > 0)
      expect(dataRows.length).toBeGreaterThan(0)
      for (const row of dataRows) {
        expect(within(row).getByText("Delivered")).toBeDefined()
      }
    })
  })

  it("opens the detail overlay with line items and total", async () => {
    const user = userEvent.setup()
    await renderOrders()
    await screen.findByRole("table", { name: /Orders/ })

    await user.click(screen.getAllByRole("button", { name: /^View/ })[0] as HTMLElement)
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("columnheader", { name: "Item" })).toBeDefined()
    expect(within(dialog).getByText("Total")).toBeDefined()
  })

  it("advances an order's status optimistically for an operator", async () => {
    const user = userEvent.setup()
    await renderOrders()
    await screen.findByRole("table", { name: /Orders/ })

    await user.click(screen.getAllByRole("button", { name: /^View/ })[0] as HTMLElement)
    const dialog = await screen.findByRole("dialog")
    const select = within(dialog).getByRole("combobox", {
      name: "Update status",
    }) as HTMLSelectElement
    const label: Record<string, string> = {
      pending: "Pending",
      processing: "Processing",
      shipped: "Shipped",
      delivered: "Delivered",
      cancelled: "Cancelled",
    }
    const target = Object.keys(label).find((status) => status !== select.value) as string

    // Hold the PATCH open so the assertions observe the in-flight optimistic state, not the settled
    // server result. The handler persists to the store and resolves only when the test releases the
    // deferred, so the post-success list refetch stays consistent with the reconciled row.
    const release = deferred<void>()
    handle.server.use(
      http.patch("*/api/orders/:id", async ({ params, request }) => {
        const body = (await request.json()) as { status: Order["status"] }
        await release.promise
        const store = handle.api.stores.orders
        const index = store.findIndex((row) => row.id === params.id)
        const current = store.getAll()[index]
        if (current === undefined) throw new Error(`order ${String(params.id)} not found`)
        const updated = { ...current, status: body.status, updatedAt: new Date().toISOString() }
        store.update(index, updated)
        return HttpResponse.json({ data: updated })
      }),
    )

    await user.selectOptions(select, target)

    // Optimistic: the controlled select (its `value` tracks the cached row) already shows the new
    // status while the request is in flight, and the control is disabled so a second change cannot
    // overlap the first.
    await waitFor(() => expect(select.value).toBe(target))
    expect(select.disabled).toBe(true)

    // Reconcile: releasing the PATCH settles the persisted row and the row stays on the new status.
    release.resolve()
    await waitFor(() => expect(select.disabled).toBe(false))
    expect(select.value).toBe(target)
  })

  it("hides the status control from a guest", async () => {
    const user = userEvent.setup()
    await renderOrders({ authed: false })
    await screen.findByRole("table", { name: /Orders/ })

    await user.click(screen.getAllByRole("button", { name: /^View/ })[0] as HTMLElement)
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).queryByRole("combobox", { name: "Update status" })).toBeNull()
  })

  it("surfaces an error and rolls back when a status change fails", async () => {
    const user = userEvent.setup()
    await renderOrders()
    await screen.findByRole("table", { name: /Orders/ })

    await user.click(screen.getAllByRole("button", { name: /^View/ })[0] as HTMLElement)
    const dialog = await screen.findByRole("dialog")
    const select = within(dialog).getByRole("combobox", {
      name: "Update status",
    }) as HTMLSelectElement
    const original = select.value
    const target = ["pending", "processing", "shipped", "delivered", "cancelled"].find(
      (status) => status !== select.value,
    ) as string
    handle.server.use(http.patch("*/api/orders/:id", () => new HttpResponse(null, { status: 500 })))
    await user.selectOptions(select, target)

    expect(await screen.findByText("That status change could not be saved")).toBeDefined()
    await waitFor(() => expect(select.value).toBe(original))
  })

  it("renders an error callout when the orders query fails", async () => {
    handle.server.use(http.get("*/api/orders", () => new HttpResponse(null, { status: 500 })))
    await renderOrders({ prefetch: false })
    expect(await screen.findByText("Orders are unavailable")).toBeDefined()
  })

  it("carries no axe violations with the detail overlay open", async () => {
    const user = userEvent.setup()
    const { container } = await renderOrders()
    await screen.findByRole("table", { name: /Orders/ })
    await user.click(screen.getAllByRole("button", { name: /^View/ })[0] as HTMLElement)
    await screen.findByRole("dialog")
    await expectNoAxeViolations(container)
  })
})
