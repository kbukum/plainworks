import type { User } from "@plainworks/demo"
import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { bindMockServerLifecycle } from "@plainworks/mocks/lifecycle"
import { createQueryClient } from "@plainworks/query"
import { listQueryOptions } from "@plainworks/query/list"
import type { PaginatedResult } from "@plainworks/std/list"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { userList } from "./user-reads"

// The data spine assembled the way an app wires it: a TanStack cache (`@plainworks/query`), a typed
// fetch client (`@plainworks/http`), and the MSW mock service (`@plainworks/demo`) standing in for
// the backend. This scenario proves an offset read flows http → mock → query and lands in the cache
// under the derived key, then is served from cache. List *types* come from `@plainworks/query` (the
// facade); only the URL serializer `buildListQuery` comes from `@plainworks/http`.

const handle = createMockServerHandle({ seed: 42 })
const client = createHttpClient({ baseUrl: "http://mock.test" })

bindMockServerLifecycle(handle.server, { hooks: { beforeAll, afterEach, afterAll } })
afterEach(() => {
  handle.api.reset()
})

describe("offset read into cache", () => {
  it("fetches a page through http and caches it under the query's derived key", async () => {
    const queryClient = createQueryClient()
    const plan = listQueryOptions<User>({
      resource: "users",
      params: { sortBy: "name", order: "asc", page: 1, pageSize: 5 },
      fetch: (params, signal) => userList.read(client, params, signal),
    })

    const fetched = await queryClient.fetchQuery(plan)
    expect(fetched.data.length).toBeLessThanOrEqual(5)

    // A second read is served from the cache the fetch populated — same key, same reference.
    const cached = queryClient.getQueryData<PaginatedResult<User>>(plan.queryKey)
    expect(cached).toBe(fetched)
  })
})
