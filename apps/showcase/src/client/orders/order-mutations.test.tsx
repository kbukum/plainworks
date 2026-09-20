// @vitest-environment jsdom

import type { Order } from "@plainworks/demo"
import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { createQueryClient, type PaginatedResult, prefetchQuery } from "@plainworks/query"
import { deferred } from "@plainworks/testkit"
import { QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { HttpResponse, http } from "msw"
import type { ReactElement, ReactNode } from "react"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { ORDER_LIST_PARAMS } from "../../app/constants"
import { orderListPlan } from "../../app/order-read"
import { HttpClientProvider } from "../http-client"
import { useOrderMutations } from "./order-mutations"

// The order status mutation proven where the UI cannot reach it: two changes fired before either
// settles. The disabled control serializes changes in the app, so out-of-order completion is only
// observable by driving the hook directly — the boundary this test guards.

const STATUSES: Order["status"][] = ["pending", "processing", "shipped", "delivered", "cancelled"]
const handle = createMockServerHandle({ seed: 11 })

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  handle.server.resetHandlers()
  handle.api.reset()
})
afterAll(() => handle.server.close())

type OrderPage = PaginatedResult<Order>

async function setup() {
  const httpClient = createHttpClient({ baseUrl: "http://showcase.test" })
  const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } })
  const plan = orderListPlan(httpClient, ORDER_LIST_PARAMS)
  await prefetchQuery(queryClient, plan)
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={queryClient}>
      <HttpClientProvider client={httpClient}>{children}</HttpClientProvider>
    </QueryClientProvider>
  )
  const { result } = renderHook(() => useOrderMutations(plan.queryKey, ORDER_LIST_PARAMS), {
    wrapper,
  })
  const order = queryClient.getQueryData<OrderPage>(plan.queryKey)?.data[0]
  if (order === undefined) throw new Error("expected a seeded order")
  const cachedStatus = (id: string): Order["status"] | undefined =>
    queryClient.getQueryData<OrderPage>(plan.queryKey)?.data.find((row) => row.id === id)?.status
  return { result, order, cachedStatus }
}

describe("useOrderMutations serialization", () => {
  it("issues overlapping changes in call order so the last selection wins on server and cache", async () => {
    const { result, order, cachedStatus } = await setup()
    const [first, second] = STATUSES.filter((status) => status !== order.status)
    if (first === undefined || second === undefined) throw new Error("need two distinct statuses")

    const received: Order["status"][] = []
    const firstReceived = deferred<void>()
    const release = deferred<void>()
    handle.server.use(
      http.patch("*/api/orders/:id", async ({ params, request }) => {
        const body = (await request.json()) as { status: Order["status"] }
        received.push(body.status)
        if (received.length === 1) {
          firstReceived.resolve()
          await release.promise
        }
        const store = handle.api.stores.orders
        const index = store.findIndex((row) => row.id === params.id)
        const current = store.getAll()[index]
        if (current === undefined) throw new Error(`order ${String(params.id)} not found`)
        const updated = { ...current, status: body.status, updatedAt: new Date().toISOString() }
        store.update(index, updated)
        return HttpResponse.json({ data: updated })
      }),
    )

    // The first change is genuinely in flight (its PATCH received, held open) before the second is
    // made, so the two overlap the way only direct hook use — never the disabled control — allows.
    let firstChange: Promise<boolean> = Promise.resolve(false)
    let secondChange: Promise<boolean> = Promise.resolve(false)
    await act(async () => {
      firstChange = result.current.changeStatus(order, first)
      await firstReceived.promise
    })
    await act(async () => {
      secondChange = result.current.changeStatus(order, second)
    })

    // The second PATCH is serialized behind the in-flight first: it has not reached the server yet.
    expect(received).toEqual([first])

    await act(async () => {
      release.resolve()
      await Promise.all([firstChange, secondChange])
    })

    // The second PATCH goes out only after the first settles, so the server ends on the newer
    // selection and the cache agrees — an older write can never land last.
    expect(received).toEqual([first, second])
    expect(handle.api.stores.orders.getAll().find((row) => row.id === order.id)?.status).toBe(
      second,
    )
    expect(cachedStatus(order.id)).toBe(second)
  })
})
