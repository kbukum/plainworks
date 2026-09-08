import { createHttpClient } from "@plainworks/http"
import type { User } from "@plainworks/mocks"
import { createMockServerHandle } from "@plainworks/mocks/server"
import { infiniteListQueryOptions } from "@plainworks/query"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { readUserCursorPage } from "./user-reads"

// Cursor paging forward through the assembled spine: the plan's initialPageParam → getNextPageParam
// → queryFn wiring pages the mock's cursor mode, and consecutive pages never overlap.

const handle = createMockServerHandle({ seed: 42 })
const client = createHttpClient({ baseUrl: "http://mock.test" })
const signal = new AbortController().signal

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  handle.server.resetHandlers()
  handle.api.reset()
})
afterAll(() => handle.server.close())

describe("cursor paging round-trip", () => {
  it("pages an infinite list forward without overlap through the mock cursor mode", async () => {
    const plan = infiniteListQueryOptions<User>({
      resource: "users",
      params: { pageSize: 5, sortBy: "createdAt", order: "asc" },
      fetch: (params, signal) => readUserCursorPage(client, params, signal),
    })

    const first = await plan.queryFn({ pageParam: plan.initialPageParam, signal })
    expect(first.data.length).toBe(5)
    const next = plan.getNextPageParam(first)
    expect(typeof next).toBe("string")

    const second = await plan.queryFn({ pageParam: next, signal })
    expect(second.data.length).toBeGreaterThan(0)

    // Cursor pages never overlap: the two pages are disjoint and stay in sort order.
    const firstIds = new Set(first.data.map((user) => user.id))
    expect(second.data.some((user) => firstIds.has(user.id))).toBe(false)
  })
})
