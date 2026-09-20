import type { Order } from "@plainworks/demo"
import { createHttpClient } from "@plainworks/http"
import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { updateOrderStatus } from "./order-write"

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("order-write", () => {
  const client = createHttpClient({ baseUrl: "http://test.local" })

  const validOrder: Order = {
    id: "order-1",
    customerId: "cust-1",
    customerName: "Alice Smith",
    customerEmail: "alice@example.com",
    status: "processing",
    total: 49.99,
    items: [{ productId: "p-1", name: "Item", quantity: 1, price: 49.99 }],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  }

  it("updates an order status and validates the response envelope", async () => {
    let capturedBody: unknown
    server.use(
      http.patch("http://test.local/api/orders/:id", async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({ data: validOrder })
      }),
    )

    const updated = await updateOrderStatus(client, "order-1", "processing")
    expect(capturedBody).toEqual({ status: "processing" })
    expect(updated).toEqual(validOrder)
  })

  it("updates an order with encoded id segment", async () => {
    let requestedPath = ""
    server.use(
      http.patch("http://test.local/api/orders/:id", async ({ params }) => {
        requestedPath = String(params.id)
        return HttpResponse.json({
          data: { ...validOrder, id: requestedPath },
        })
      }),
    )

    const updated = await updateOrderStatus(client, "order 1# special", "shipped")
    expect(requestedPath).toBe("order 1# special")
    expect(updated.id).toBe("order 1# special")
  })

  it("rejects dangerous or dot-segment ids", async () => {
    await expect(updateOrderStatus(client, ".", "delivered")).rejects.toThrow("Invalid order id")
    await expect(updateOrderStatus(client, "..", "delivered")).rejects.toThrow("Invalid order id")
    await expect(updateOrderStatus(client, "../settings", "delivered")).rejects.toThrow(
      "Invalid order id",
    )
    await expect(updateOrderStatus(client, "foo/bar", "delivered")).rejects.toThrow(
      "Invalid order id",
    )
    await expect(updateOrderStatus(client, "foo\\bar", "delivered")).rejects.toThrow(
      "Invalid order id",
    )
    await expect(updateOrderStatus(client, "   ", "delivered")).rejects.toThrow("Invalid order id")
  })

  it("rejects a malformed response body failing schema validation", async () => {
    server.use(
      http.patch("http://test.local/api/orders/:id", () =>
        HttpResponse.json({ data: { id: "order-1", status: "invalid_status" } }),
      ),
    )

    await expect(updateOrderStatus(client, "order-1", "processing")).rejects.toThrow()
  })

  it("throws when PATCH returns no body", async () => {
    server.use(
      http.patch("http://test.local/api/orders/:id", () => new HttpResponse(null, { status: 204 })),
    )

    await expect(updateOrderStatus(client, "order-1", "processing")).rejects.toThrow(
      "PATCH /api/orders/order-1 returned no body",
    )
  })
})
