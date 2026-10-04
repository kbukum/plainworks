import { afterEach, describe, expect, it } from "vitest"
import { createShowcaseBackend, type ShowcaseBackend } from "../../../test/backend"

let backend: ShowcaseBackend | undefined
afterEach(() => backend?.close())

function patchStatus(cookie: string | undefined): RequestInit {
  return {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(cookie === undefined ? {} : { cookie }),
    },
    body: JSON.stringify({ status: "cancelled" }),
  }
}

describe("order writes at the backend boundary", () => {
  it("a named operator's opaque session updates the order", async () => {
    backend = await createShowcaseBackend()
    const order = backend.api.stores.orders.getAll()[0]
    if (order === undefined) throw new Error("seed has no orders")
    const response = await backend.send(
      `/api/orders/${order.id}`,
      patchStatus(await backend.signIn()),
    )
    expect(response.status).toBe(200)
    expect(backend.api.stores.orders.getAll()[0]?.status).toBe("cancelled")
  })

  it.each([
    ["a guest", async () => undefined, { name: "Ada" }],
    ["a forged session cookie", async () => "__Host-session=forged", { name: "Ada" }],
    ["an unnamed identity", (b: ShowcaseBackend) => b.signIn(), {}],
  ] as const)("%s is denied and the order is unchanged", async (_, cookieOf, claims) => {
    backend = await createShowcaseBackend(claims)
    const before = structuredClone(backend.api.stores.orders.getAll())
    const order = before.find((candidate) => candidate.status !== "cancelled")
    if (order === undefined) throw new Error("seed has no open orders")
    const response = await backend.send(
      `/api/orders/${order.id}`,
      patchStatus(await cookieOf(backend)),
    )
    expect(response.status).toBe(403)
    expect(backend.api.stores.orders.getAll()).toEqual(before)
  })

  it("unavailable session storage fails the write and leaves the order unchanged", async () => {
    backend = await createShowcaseBackend()
    const cookie = await backend.signIn()
    const before = structuredClone(backend.api.stores.orders.getAll())
    const order = before.find((candidate) => candidate.status !== "cancelled")
    if (order === undefined) throw new Error("seed has no open orders")
    backend.failStorage()
    const response = await backend.send(`/api/orders/${order.id}`, patchStatus(cookie))
    expect(response.status).toBe(500)
    expect(backend.api.stores.orders.getAll()).toEqual(before)
  })
})
