import { createHttpClient } from "@plainworks/http"
import type { User } from "@plainworks/mocks"
import { createMockServerHandle } from "@plainworks/mocks/server"
import { createQueryClient, listQueryOptions, type PaginatedResult } from "@plainworks/query"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { readUserPage } from "./user-reads"

// A filter that matches nothing must yield a *real* empty envelope through the assembled spine, not
// a `null`/`undefined` masquerading as a page, and that empty envelope must still cache — no
// success-shaped fallback on the read path.

const handle = createMockServerHandle({ seed: 42 })
const client = createHttpClient({ baseUrl: "http://mock.test" })

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  handle.server.resetHandlers()
  handle.api.reset()
})
afterAll(() => handle.server.close())

describe("empty page through the cache", () => {
  it("caches an empty page for a filter that matches nothing without a success-shaped fallback", async () => {
    const queryClient = createQueryClient()
    const plan = listQueryOptions<User>({
      resource: "users",
      // No seeded user has this status, so the mock returns a genuinely empty page.
      params: { filters: [{ field: "status", op: "eq", value: "does-not-exist" }], pageSize: 5 },
      fetch: (params, signal) => readUserPage(client, params, signal),
    })

    const fetched = await queryClient.fetchQuery(plan)
    // An empty result is the real envelope, not `undefined`/`null` masquerading as a page.
    expect(fetched.data).toEqual([])
    expect(fetched.pagination.total).toBe(0)
    expect(fetched.pagination.totalPages).toBe(0)
    expect(queryClient.getQueryData<PaginatedResult<User>>(plan.queryKey)).toBe(fetched)
  })
})
