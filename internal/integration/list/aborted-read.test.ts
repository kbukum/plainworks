import { createHttpClient } from "@plainworks/http"
import type { User } from "@plainworks/mocks"
import { createMockServerHandle } from "@plainworks/mocks/server"
import { createQueryClient, listQueryOptions } from "@plainworks/query"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { readUserPage } from "./user-reads"

// An abandoned read must reject and never populate the cache: the plan threads the query signal into
// the http fetch, so the abort propagates through mock → http → plan before a value can resolve.

const handle = createMockServerHandle({ seed: 42 })
const client = createHttpClient({ baseUrl: "http://mock.test" })

const usersPlan = () =>
  listQueryOptions<User>({
    resource: "users",
    params: { pageSize: 5 },
    fetch: (params, signal) => readUserPage(client, params, signal),
  })

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  handle.server.resetHandlers()
  handle.api.reset()
})
afterAll(() => handle.server.close())

describe("aborted read through the plan", () => {
  it("rejects an aborted read and never populates the cache", async () => {
    const queryClient = createQueryClient()
    const plan = usersPlan()

    // Run through the client so the cache assertion is real: cancel the in-flight query (the
    // unmount/abandon path — TanStack aborts the query-function signal it threads into the http
    // fetch), and the rejected read must leave no data under the key.
    const read = queryClient.fetchQuery(plan)
    await queryClient.cancelQueries({ queryKey: plan.queryKey })

    await expect(read).rejects.toBeDefined()
    expect(queryClient.getQueryData(plan.queryKey)).toBeUndefined()
  })
})
