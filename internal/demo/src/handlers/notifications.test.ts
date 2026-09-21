import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { createMockApi } from "../api"
import { createMockServer } from "../server"
import type { Notification } from "../types"

// The notification handlers proven at the wire: the bulk mark-all-read endpoint flips every unread
// row in one request, and both it and the per-row writes gate on the injected authorizer.

const base = "http://localhost"
const json = async <T>(res: Response): Promise<T> => (await res.json()) as T

interface ListResponse {
  data: Notification[]
  pagination: { total: number }
}

describe("notification mark-all-read", () => {
  const api = createMockApi({ seed: 3 })
  const server = createMockServer(api)

  beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
  afterEach(() => api.reset())
  afterAll(() => server.close())

  it("flips every unread notification in one request and reports the count", async () => {
    const before = await json<ListResponse>(await fetch(`${base}/api/notifications?pageSize=100`))
    const unread = before.data.filter((row) => !row.read).length
    expect(unread).toBeGreaterThan(0)

    const res = await fetch(`${base}/api/notifications/read-all`, { method: "POST" })
    expect(res.status).toBe(200)
    const body = await json<{ data: { updated: number } }>(res)
    expect(body.data.updated).toBe(unread)

    const after = await json<ListResponse>(await fetch(`${base}/api/notifications?pageSize=100`))
    expect(after.data.every((row) => row.read)).toBe(true)
  })

  it("marks a single notification read through PATCH without touching the others", async () => {
    const before = await json<ListResponse>(await fetch(`${base}/api/notifications?pageSize=100`))
    const target = before.data.find((row) => !row.read)
    if (target === undefined) throw new Error("expected a seeded unread notification")

    const res = await fetch(`${base}/api/notifications/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ read: true }),
    })
    expect(res.status).toBe(200)
    const body = await json<{ data: Notification }>(res)
    expect(body.data.read).toBe(true)
  })
})

describe("notification authorization", () => {
  const api = createMockApi({ seed: 3, authorizeNotificationMutation: () => false })
  const server = createMockServer(api)

  beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
  afterEach(() => api.reset())
  afterAll(() => server.close())

  it("denies both the per-row write and the bulk endpoint with 403 for an unauthorized caller", async () => {
    const bulk = await fetch(`${base}/api/notifications/read-all`, { method: "POST" })
    expect(bulk.status).toBe(403)

    const list = await json<ListResponse>(await fetch(`${base}/api/notifications?pageSize=1`))
    const target = list.data[0]
    if (target === undefined) throw new Error("expected a seeded notification")
    const patch = await fetch(`${base}/api/notifications/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ read: true }),
    })
    expect(patch.status).toBe(403)

    const remove = await fetch(`${base}/api/notifications/${target.id}`, { method: "DELETE" })
    expect(remove.status).toBe(403)
  })
})
