import { createHttpClient } from "@plainworks/http"
import type { User } from "@plainworks/mocks"
import { createMockServerHandle } from "@plainworks/mocks/server"
import { createQueryClient, infiniteListQueryOptions } from "@plainworks/query"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { readUserCursorPage } from "./user-reads"

// An infinite (cursor) list accumulates its pages under one cache key, and those pages stay disjoint —
// cursor mode is the default precisely because a cursor does not drift as rows change between fetches.

const handle = createMockServerHandle({ seed: 42 })
const client = createHttpClient({ baseUrl: "http://mock.test" })

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  handle.server.resetHandlers()
  handle.api.reset()
})
afterAll(() => handle.server.close())

describe("infinite list through the cache", () => {
  it("accumulates cursor pages under one key without drift", async () => {
    const queryClient = createQueryClient()
    const plan = infiniteListQueryOptions<User>({
      resource: "users",
      params: { pageSize: 5, sortBy: "createdAt", order: "asc" },
      fetch: (params, signal) => readUserCursorPage(client, params, signal),
    })

    // Prefetch two pages, exercising initialPageParam → getNextPageParam → queryFn through the cache.
    const result = await queryClient.fetchInfiniteQuery({ ...plan, pages: 2 })
    expect(result.pages).toHaveLength(2)

    expect(queryClient.getQueryData(plan.queryKey)).toBe(result)

    // Cursor pages never overlap: the accumulated pages stay disjoint in the cache.
    const firstIds = new Set(result.pages[0]?.data.map((user) => user.id))
    const secondIds = result.pages[1]?.data.map((user) => user.id) ?? []
    expect(secondIds.some((id) => firstIds.has(id))).toBe(false)
  })
})
