import { encodeSession } from "@plainworks/auth"
import { createMockServerHandle } from "@plainworks/demo/server"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { type ShowcaseSessionValue, showcaseSessionCodec, showcaseSessionReader } from "./auth"
import { SESSION_COOKIE } from "./constants"
import { createOrderMutationAuthorizer } from "./order-authz"

// The order mutation boundary proven where it is enforced — the mock backend. The client `<Can>`
// gate only hides the control; this seam is the real authorization. It verifies the signed session
// cookie the BFF issues (a forged or tampered value never passes) and applies the same
// named-identity policy as the gate, so only a signed-in operator carrying a valid cookie is
// served.

const SIGNING_KEY = new TextEncoder().encode("showcase-order-authz-test-signing-key")
const codec = showcaseSessionCodec(SIGNING_KEY)
const authorize = createOrderMutationAuthorizer(showcaseSessionReader(SIGNING_KEY))
const base = "http://showcase.test"

async function signedCookie(value: ShowcaseSessionValue): Promise<string> {
  return `${SESSION_COOKIE}=${await encodeSession(codec, value)}`
}

function patchRequest(cookie?: string): Request {
  return new Request(`${base}/api/orders/o1`, {
    method: "PATCH",
    ...(cookie === undefined ? {} : { headers: { cookie } }),
  })
}

describe("createOrderMutationAuthorizer", () => {
  it("accepts a request carrying a validly-signed, named session cookie", async () => {
    const request = patchRequest(await signedCookie({ subject: "user-123", name: "Ada" }))
    expect(await authorize(request)).toBe(true)
  })

  it("rejects a forged cookie value under the session name", async () => {
    expect(await authorize(patchRequest(`${SESSION_COOKIE}=forged.value`))).toBe(false)
  })

  it("rejects a tampered cookie whose signature no longer verifies", async () => {
    const valid = await encodeSession(codec, { subject: "user-123", name: "Ada" })
    const tampered = `${valid.slice(0, -2)}xx`
    expect(await authorize(patchRequest(`${SESSION_COOKIE}=${tampered}`))).toBe(false)
  })

  it("rejects a validly-signed session with no name (fails the order policy)", async () => {
    const request = patchRequest(await signedCookie({ subject: "guest-1" }))
    expect(await authorize(request)).toBe(false)
  })

  it("rejects a request with no cookie header", async () => {
    expect(await authorize(patchRequest())).toBe(false)
  })
})

describe("order mutation boundary", () => {
  const handle = createMockServerHandle({ seed: 5, authorizeOrderMutation: authorize })

  interface OrderResponse {
    readonly data: { readonly id: string; readonly status: string } | null
    readonly error?: string
  }

  beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
  afterEach(() => {
    handle.server.resetHandlers()
    handle.api.reset()
  })
  afterAll(() => handle.server.close())

  function patchStatus(id: string, cookie?: string): Promise<Response> {
    return fetch(`${base}/api/orders/${id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({ status: "shipped" }),
    })
  }

  it("rejects an order status change from a caller without a session (403)", async () => {
    const order = handle.api.stores.orders.getAll()[0]
    if (order === undefined) throw new Error("expected a seeded order")

    const res = await patchStatus(order.id)

    expect(res.status).toBe(403)
    // The store is untouched, so the gate is authorization, not a client-side affordance.
    expect(handle.api.stores.orders.getAll()[0]?.status).toBe(order.status)
  })

  it("rejects an order status change carrying a forged session cookie (403)", async () => {
    const order = handle.api.stores.orders.getAll()[0]
    if (order === undefined) throw new Error("expected a seeded order")

    const res = await patchStatus(order.id, `${SESSION_COOKIE}=forged.value`)

    expect(res.status).toBe(403)
    expect(handle.api.stores.orders.getAll()[0]?.status).toBe(order.status)
  })

  it("serves an order status change for a caller carrying a valid session cookie", async () => {
    const order = handle.api.stores.orders.getAll()[0]
    if (order === undefined) throw new Error("expected a seeded order")

    const res = await patchStatus(
      order.id,
      await signedCookie({ subject: "user-123", name: "Ada" }),
    )
    const body = (await res.json()) as OrderResponse

    expect(res.status).toBe(200)
    expect(body.data?.status).toBe("shipped")
  })
})
