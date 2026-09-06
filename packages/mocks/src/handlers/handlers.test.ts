import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { createMockApi } from "../api"
import { createMockServer } from "../server"

// Fresh, isolated mock graph per suite; latency stays disabled (0 ms) so no real timers run.
const api = createMockApi()
const server = createMockServer(api)
const base = "http://localhost"

interface ListResponse {
  data: Array<Record<string, unknown>>
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
  facets?: Record<string, Record<string, number>>
}
interface ItemResponse {
  data: Record<string, unknown> | null
  error?: string
}

const json = async <T>(res: Response): Promise<T> => (await res.json()) as T

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" })
})
afterEach(() => {
  api.reset()
})
afterAll(() => {
  server.close()
})

describe("crud list handler", () => {
  it("paginates and reports totals", async () => {
    const res = await fetch(`${base}/api/users?page=2&limit=5`)
    const body = await json<ListResponse>(res)
    expect(res.status).toBe(200)
    expect(body.data.length).toBeLessThanOrEqual(5)
    expect(body.pagination.page).toBe(2)
    expect(body.pagination.total).toBeGreaterThan(0)
  })

  it("rejects non-positive-integer page and limit with 400", async () => {
    expect((await fetch(`${base}/api/users?page=0`)).status).toBe(400)
    expect((await fetch(`${base}/api/users?page=-2`)).status).toBe(400)
    expect((await fetch(`${base}/api/users?limit=1.5`)).status).toBe(400)
    expect((await fetch(`${base}/api/users?limit=abc`)).status).toBe(400)
  })

  it("rejects unknown sort fields and bad sort orders with 400", async () => {
    expect((await fetch(`${base}/api/users?sortBy=password`)).status).toBe(400)
    expect((await fetch(`${base}/api/users?sortBy=email&order=sideways`)).status).toBe(400)
  })

  it("computes cross-filtered facets and applies a filter", async () => {
    const listRes = await fetch(`${base}/api/users`)
    const list = await json<ListResponse>(listRes)
    expect(list.facets?.role).toBeDefined()
    expect(list.facets?.role?._total).toBe(list.pagination.total)

    const role = Object.keys(list.facets?.role ?? {}).find((k) => k !== "_total")
    const filtered = await json<ListResponse>(
      await fetch(`${base}/api/users?filter=${encodeURIComponent(`role=eq.${role}`)}`),
    )
    expect(filtered.data.every((u) => u.role === role)).toBe(true)
  })

  it("searches, sorts, and supports legacy field filters", async () => {
    const searched = await json<ListResponse>(await fetch(`${base}/api/users?search=@`))
    expect(searched.data.length).toBeGreaterThan(0)

    const asc = await json<ListResponse>(await fetch(`${base}/api/users?sortBy=email&order=asc`))
    const desc = await json<ListResponse>(await fetch(`${base}/api/users?sortBy=email&order=desc`))
    expect(asc.data[0]?.email).not.toBe(desc.data[0]?.email)

    const role = String(searched.data[0]?.role)
    const byField = await json<ListResponse>(await fetch(`${base}/api/users?role=${role}`))
    expect(byField.data.every((u) => u.role === role)).toBe(true)
  })

  it("computes facets consistently with legacy exact-field filters", async () => {
    const role = "admin"
    const res = await json<ListResponse>(await fetch(`${base}/api/users?role=${role}`))
    expect(res.data.every((u) => u.role === role)).toBe(true)
    // Facet totals reflect the filtered result set, not the whole store.
    expect(res.facets?.status?._total).toBe(res.pagination.total)
  })

  it("rejects typed fields with the wrong shape", async () => {
    expect(
      (
        await fetch(`${base}/api/users`, {
          method: "POST",
          body: JSON.stringify({ email: 42, role: "root" }),
        })
      ).status,
    ).toBe(400)
  })

  it("honors validated create overrides instead of randomizing them", async () => {
    const user = await json<ItemResponse>(
      await fetch(`${base}/api/users`, {
        method: "POST",
        body: JSON.stringify({ email: "a@b.c", age: 42, score: 7, verified: true }),
      }),
    )
    expect(user.data?.age).toBe(42)
    expect(user.data?.score).toBe(7)
    expect(user.data?.verified).toBe(true)

    const notification = await json<ItemResponse>(
      await fetch(`${base}/api/notifications`, {
        method: "POST",
        body: JSON.stringify({ userId: "u1", type: "info", title: "t", message: "m", read: true }),
      }),
    )
    expect(notification.data?.read).toBe(true)

    const order = await json<ItemResponse>(
      await fetch(`${base}/api/orders`, {
        method: "POST",
        body: JSON.stringify({
          customerId: "c1",
          customerName: "A",
          customerEmail: "a@b.c",
          status: "shipped",
          items: [{ productId: "p1", name: "Widget", quantity: 2, price: 10 }],
        }),
      }),
    )
    expect(order.data?.status).toBe("shipped")
    expect(order.data?.total).toBe(20)
  })

  it("rejects malformed nested items with 400", async () => {
    expect(
      (
        await fetch(`${base}/api/orders`, {
          method: "POST",
          body: JSON.stringify({ items: [{}] }),
        })
      ).status,
    ).toBe(400)
  })

  it("recomputes derived fields on patch", async () => {
    const created = await json<ItemResponse>(
      await fetch(`${base}/api/orders`, {
        method: "POST",
        body: JSON.stringify({
          customerId: "c1",
          customerName: "A",
          customerEmail: "a@b.c",
          items: [{ productId: "p1", name: "Widget", quantity: 1, price: 10 }],
        }),
      }),
    )
    const id = String(created.data?.id)
    const patched = await json<ItemResponse>(
      await fetch(`${base}/api/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          items: [{ productId: "p1", name: "Widget", quantity: 3, price: 10 }],
        }),
      }),
    )
    expect(patched.data?.total).toBe(30)

    const page = await json<ItemResponse>(
      await fetch(`${base}/api/content-pages`, {
        method: "POST",
        body: JSON.stringify({ title: "Old Title", content: "body" }),
      }),
    )
    const pageId = String(page.data?.id)
    const renamed = await json<ItemResponse>(
      await fetch(`${base}/api/content-pages/${pageId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "New Title" }),
      }),
    )
    expect(String(renamed.data?.slug)).toMatch(/^new-title-\d+$/)
  })

  it("filters boolean fields from string query params", async () => {
    const legacy = await json<ListResponse>(await fetch(`${base}/api/users?verified=true`))
    expect(legacy.data.length).toBeGreaterThan(0)
    expect(legacy.data.every((u) => u.verified === true)).toBe(true)

    const postgrest = await json<ListResponse>(
      await fetch(`${base}/api/users?filter=${encodeURIComponent("verified=eq.false")}`),
    )
    expect(postgrest.data.every((u) => u.verified === false)).toBe(true)
  })
})

describe("crud item handlers", () => {
  it("creates, reads, updates, and deletes an entity", async () => {
    const created = await json<ItemResponse>(
      await fetch(`${base}/api/users`, {
        method: "POST",
        body: JSON.stringify({ email: "new@example.com", role: "admin", status: "active" }),
      }),
    )
    const id = String(created.data?.id)
    expect(created.data?.email).toBe("new@example.com")

    const read = await fetch(`${base}/api/users/${id}`)
    expect(read.status).toBe(200)

    const patched = await json<ItemResponse>(
      await fetch(`${base}/api/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ email: "changed@example.com" }),
      }),
    )
    expect(patched.data?.email).toBe("changed@example.com")

    const deleted = await fetch(`${base}/api/users/${id}`, { method: "DELETE" })
    expect(deleted.status).toBe(200)

    const missing = await fetch(`${base}/api/users/${id}`)
    expect(missing.status).toBe(404)
  })

  it("returns 404 when updating or deleting an unknown id", async () => {
    expect((await fetch(`${base}/api/users/nope`, { method: "PATCH", body: "{}" })).status).toBe(
      404,
    )
    expect((await fetch(`${base}/api/users/nope`, { method: "DELETE" })).status).toBe(404)
  })

  it("rejects malformed bodies with 400", async () => {
    expect((await fetch(`${base}/api/users`, { method: "POST", body: "not json" })).status).toBe(
      400,
    )
    expect(
      (await fetch(`${base}/api/users`, { method: "POST", body: JSON.stringify([1, 2]) })).status,
    ).toBe(400)

    const created = await json<ItemResponse>(
      await fetch(`${base}/api/users`, { method: "POST", body: "{}" }),
    )
    const id = String(created.data?.id)
    expect(
      (await fetch(`${base}/api/users/${id}`, { method: "PATCH", body: JSON.stringify("nope") }))
        .status,
    ).toBe(400)
  })

  it("never patches the immutable id", async () => {
    const created = await json<ItemResponse>(
      await fetch(`${base}/api/users`, { method: "POST", body: "{}" }),
    )
    const id = String(created.data?.id)

    const patched = await json<ItemResponse>(
      await fetch(`${base}/api/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ id: "hijacked", email: "ok@example.com" }),
      }),
    )
    expect(patched.data?.id).toBe(id)
  })
})

describe("domain handler registration", () => {
  it("serves a list for every seeded resource", async () => {
    for (const path of [
      "/api/products",
      "/api/orders",
      "/api/tasks",
      "/api/notifications",
      "/api/content-pages",
    ]) {
      const body = await json<ListResponse>(await fetch(`${base}${path}`))
      expect(body.pagination.total).toBeGreaterThan(0)
    }
  })
})

describe("dashboard handlers", () => {
  it("serves every dashboard endpoint", async () => {
    for (const path of [
      "/api/dashboard/stats",
      "/api/dashboard/overview",
      "/api/dashboard/daily-sales?days=3",
      "/api/dashboard/monthly-revenue?months=3",
      "/api/dashboard/top-products?limit=3",
      "/api/dashboard/revenue?days=3",
      "/api/dashboard/user-growth?days=3",
    ]) {
      expect((await fetch(`${base}${path}`)).status).toBe(200)
    }
  })

  it("rejects invalid count params with 400", async () => {
    expect((await fetch(`${base}/api/dashboard/daily-sales?days=0`)).status).toBe(400)
    expect((await fetch(`${base}/api/dashboard/monthly-revenue?months=-1`)).status).toBe(400)
    expect((await fetch(`${base}/api/dashboard/top-products?limit=x`)).status).toBe(400)
  })

  it("serves monthly revenue beyond one calendar year", async () => {
    const res = await fetch(`${base}/api/dashboard/monthly-revenue?months=24`)
    const body = (await res.json()) as Array<{ month: string }>
    expect(res.status).toBe(200)
    expect(body).toHaveLength(24)
    expect(body.every((point) => /^\w{3} \d{4}$/.test(point.month))).toBe(true)
  })
})

describe("settings handlers", () => {
  it("reads, patches, and resets settings", async () => {
    const read = await json<ItemResponse>(await fetch(`${base}/api/settings?userId=u1`))
    expect(read.data?.userId).toBe("u1")

    const patched = await json<ItemResponse>(
      await fetch(`${base}/api/settings?userId=u1`, {
        method: "PATCH",
        body: JSON.stringify({ theme: "dark" }),
      }),
    )
    expect(patched.data?.theme).toBe("dark")

    const reset = await fetch(`${base}/api/settings/reset?userId=u1`, { method: "POST" })
    expect(reset.status).toBe(200)
  })

  it("rejects invalid settings bodies with 400", async () => {
    expect(
      (
        await fetch(`${base}/api/settings?userId=u1`, {
          method: "PATCH",
          body: JSON.stringify({ theme: "neon" }),
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await fetch(`${base}/api/settings?userId=u1`, {
          method: "PATCH",
          body: JSON.stringify({ notifications: { email: "yes" } }),
        })
      ).status,
    ).toBe(400)
  })

  it("resets only the addressed user's settings", async () => {
    await fetch(`${base}/api/settings?userId=u1`, {
      method: "PATCH",
      body: JSON.stringify({ theme: "dark" }),
    })
    await fetch(`${base}/api/settings?userId=u2`, {
      method: "PATCH",
      body: JSON.stringify({ theme: "light" }),
    })

    await fetch(`${base}/api/settings/reset?userId=u1`, { method: "POST" })

    const u1 = await json<ItemResponse>(await fetch(`${base}/api/settings?userId=u1`))
    const u2 = await json<ItemResponse>(await fetch(`${base}/api/settings?userId=u2`))
    expect(u1.data?.theme).toBe("system")
    expect(u2.data?.theme).toBe("light")
  })
})

describe("internal handlers", () => {
  it("logs requests and exposes control endpoints", async () => {
    await fetch(`${base}/api/tasks`)
    const log = await json<{ count: number }>(await fetch(`${base}/mock/requests`))
    expect(log.count).toBeGreaterThan(0)

    expect((await fetch(`${base}/mock/requests`, { method: "DELETE" })).status).toBe(200)

    const state = await json<ItemResponse>(await fetch(`${base}/mock/state`))
    expect(state.data).toHaveProperty("requestCount")

    expect((await fetch(`${base}/mock/reset`, { method: "POST" })).status).toBe(200)
  })

  it("fails API requests while error simulation is enabled", async () => {
    const enabled = await fetch(`${base}/mock/error`, {
      method: "POST",
      body: JSON.stringify({ enabled: true }),
    })
    expect(enabled.status).toBe(200)
    expect((await fetch(`${base}/api/users`)).status).toBe(500)

    await fetch(`${base}/mock/error`, {
      method: "POST",
      body: JSON.stringify({ enabled: false }),
    })
    expect((await fetch(`${base}/api/users`)).status).toBe(200)
  })

  it("rejects malformed control bodies with 400", async () => {
    expect((await fetch(`${base}/mock/error`, { method: "POST", body: "{}" })).status).toBe(400)
    expect(
      (
        await fetch(`${base}/mock/latency`, {
          method: "POST",
          body: JSON.stringify({ latency: "fast" }),
        })
      ).status,
    ).toBe(400)
  })

  it("applies the configured latency to responses", async () => {
    await fetch(`${base}/mock/latency`, {
      method: "POST",
      body: JSON.stringify({ latency: 25 }),
    })
    const state = await json<ItemResponse>(await fetch(`${base}/mock/state`))
    expect(state.data?.globalDelay).toBe(25)
    // The latency path still serves requests (no wall-clock assertion — the controller's timing
    // is covered with fake timers in utils tests).
    expect((await fetch(`${base}/api/tasks`)).status).toBe(200)
  })
})

describe("mock server isolation", () => {
  it("two mock APIs do not share stores or control state", () => {
    const other = createMockApi()
    other.control.setError(true)
    expect(api.control.isErrorEnabled()).toBe(false)
    other.latency.set(50)
    expect(api.latency.get()).toBe(0)
    // Distinct store instances; with the same default seed their fixtures (ids included) match.
    expect(other.stores.tasks.getAll()).not.toBe(api.stores.tasks.getAll())
    expect(other.stores.tasks.getAll()[0]?.id).toBe(api.stores.tasks.getAll()[0]?.id)
  })

  it("reset clears stores and control state", async () => {
    await fetch(`${base}/api/tasks`, { method: "POST", body: JSON.stringify({ title: "x" }) })
    expect(api.stores.tasks.getAll().some((t) => t.title === "x")).toBe(true)
    api.control.setError(true)
    api.latency.set(50)
    expect(api.control.requestLog().length).toBeGreaterThan(0)

    api.reset()

    expect(api.control.isErrorEnabled()).toBe(false)
    expect(api.latency.get()).toBe(0)
    expect(api.control.requestLog()).toHaveLength(0)
    expect(api.stores.tasks.getAll().some((t) => t.title === "x")).toBe(false)
  })

  it("same seed reproduces the same fixture content", () => {
    const a = createMockApi({ seed: 7 })
    const b = createMockApi({ seed: 7 })
    expect(a.stores.users.getAll().map((u) => u.id)).toEqual(
      b.stores.users.getAll().map((u) => u.id),
    )
    expect(a.stores.users.getAll().map((u) => u.email)).toEqual(
      b.stores.users.getAll().map((u) => u.email),
    )
  })

  it("fixture set is identical whether the first request is a read or a create", async () => {
    // A second api whose first traffic is a POST must seed the same users as this api, which was
    // exercised GET-first above.
    const other = createMockApi()
    const otherServer = createMockServer(other)
    server.close()
    otherServer.listen({ onUnhandledRequest: "error" })
    try {
      const created = await json<ItemResponse>(
        await fetch(`${base}/api/users`, {
          method: "POST",
          body: JSON.stringify({ email: "first@example.com" }),
        }),
      )
      const list = await json<ListResponse>(await fetch(`${base}/api/users?limit=500`))
      // The created entity is prepended; the seeded set behind it must be identical.
      expect(list.data.filter((u) => u.id !== created.data?.id).map((u) => u.id)).toEqual(
        api.stores.users.getAll().map((u) => u.id),
      )
    } finally {
      otherServer.close()
      server.listen({ onUnhandledRequest: "error" })
    }
  })

  it("repeating a create after reset replays the same entity", async () => {
    const first = await json<ItemResponse>(
      await fetch(`${base}/api/tasks`, { method: "POST", body: JSON.stringify({}) }),
    )
    api.reset()
    const second = await json<ItemResponse>(
      await fetch(`${base}/api/tasks`, { method: "POST", body: JSON.stringify({}) }),
    )
    expect(second.data?.id).toBe(first.data?.id)
    expect(second.data?.title).toBe(first.data?.title)
  })
})
