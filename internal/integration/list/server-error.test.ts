import { createHttpClient, HttpError } from "@plainworks/http"
import type { User } from "@plainworks/mocks"
import { createMockServerHandle } from "@plainworks/mocks/server"
import { createQueryClient, listQueryOptions } from "@plainworks/query"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { readUserPage } from "./user-reads"

// A failing backend must surface as a typed `HttpError` through `http` and `query`, and must leave
// no success-shaped value in the cache — the half a green-path scenario never reaches.
//
// The failing backend is modeled with a *bodyless* error response, not the mock's global error
// gate: on a non-2xx the client releases the failed response's body before raising (so a retry
// can't pin an unread stream), and MSW's mocked `ReadableStream.cancel()` never settles under Node
// — a JSON error body would hang that release. A bodyless response has nothing to release, keeping
// the assertion deterministic while still exercising the real non-ok → `HttpError` path over the
// network boundary.

const handle = createMockServerHandle({ seed: 42 })
const client = createHttpClient({ baseUrl: "http://mock.test" })

/** Make the users list fail with a bodyless status until `resetHandlers()` removes the override. */
function failUsersWith(status: number): void {
  handle.server.use(
    http.get("http://mock.test/api/users", () => new HttpResponse(null, { status })),
  )
}

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

describe("server error through the cache", () => {
  it("surfaces a server error as a typed HttpError and rejects the query without caching", async () => {
    // `retry: false` so the single failing attempt rejects immediately instead of backing off.
    const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } })
    const plan = usersPlan()
    failUsersWith(503)

    const error = await queryClient.fetchQuery(plan).then(
      () => undefined,
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(HttpError)
    // The failing read must not leave a success-shaped page behind for a later reader to trust.
    expect(queryClient.getQueryData(plan.queryKey)).toBeUndefined()
  })

  it("carries the status and retryability the std classifier assigns the response", async () => {
    failUsersWith(503)
    const error = await client.get("/api/users").then(
      () => undefined,
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(HttpError)
    const httpError = error as HttpError
    expect(httpError.status).toBe(503)
    expect(httpError.kind).toBe("http/status")
    // 503 is a transient server fault the shared classifier marks retryable.
    expect(httpError.retryable).toBe(true)
  })

  it("recovers once the failure clears — the error is not sticky", async () => {
    failUsersWith(503)
    await expect(client.get("/api/users")).rejects.toBeInstanceOf(HttpError)

    // Dropping the override restores the real handler; the same client now reads a live page.
    handle.server.resetHandlers()
    const body = await readUserPage(client)
    expect(body.data.length).toBeGreaterThan(0)
  })
})
