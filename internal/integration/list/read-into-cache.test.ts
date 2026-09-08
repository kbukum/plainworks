import { createHttpClient } from "@plainworks/http"
import type { User } from "@plainworks/mocks"
import { createMockServerHandle } from "@plainworks/mocks/server"
import { createQueryClient, listQueryOptions, type PaginatedResult } from "@plainworks/query"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { readUserPage } from "./user-reads"

// The data spine assembled the way an app wires it: a TanStack cache (`@plainworks/query`), a typed
// fetch client (`@plainworks/http`), and the MSW mock service (`@plainworks/mocks`) standing in for
// the backend. This scenario proves an offset read flows http → mock → query and lands in the cache
// under the derived key, then is served from cache. List *types* come from `@plainworks/query` (the
// facade); only the URL serializer `buildListQuery` comes from `@plainworks/http`.

const handle = createMockServerHandle({ seed: 42 })
const client = createHttpClient({ baseUrl: "http://mock.test" })

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  handle.server.resetHandlers()
  handle.api.reset()
})
afterAll(() => handle.server.close())

describe("offset read into cache", () => {
  it("fetches a page through http and caches it under the query's derived key", async () => {
    const queryClient = createQueryClient()
    const plan = listQueryOptions<User>({
      resource: "users",
      params: { sortBy: "name", order: "asc", page: 1, pageSize: 5 },
      fetch: (params, signal) => readUserPage(client, params, signal),
    })

    const fetched = await queryClient.fetchQuery(plan)
    expect(fetched.data.length).toBeLessThanOrEqual(5)

    // A second read is served from the cache the fetch populated — same key, same reference.
    const cached = queryClient.getQueryData<PaginatedResult<User>>(plan.queryKey)
    expect(cached).toBe(fetched)
  })
})
