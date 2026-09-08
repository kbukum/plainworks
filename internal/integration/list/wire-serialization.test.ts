import { createHttpClient, HttpError } from "@plainworks/http"
import { createMockServerHandle } from "@plainworks/mocks/server"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { readUserPage } from "./user-reads"

// The builder ↔ parser ↔ envelope agreement, proven end-to-end and in one place: `@plainworks/http`
// serializes a typed param object to the exact PostgREST wire, the `@plainworks/mocks` MSW service
// parses that wire, and the response is exactly the `{ data, pagination, facets }` envelope the
// contract specifies. Both ends bind to the one contract in `@plainworks/std`, so the operator
// tokens can't drift by construction — this asserts they are actually wired to it, and that a
// renamed envelope field reddens here. This is the home of the builder↔parser assertion that the
// `mocks` parser unit tests (which feed literal wire strings) deliberately do not carry.

const handle = createMockServerHandle({ seed: 42 })
const client = createHttpClient({ baseUrl: "http://mock.test" })

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  handle.server.resetHandlers()
  handle.api.reset()
})
afterAll(() => handle.server.close())

describe("list wire serialization", () => {
  it("serializes, parses, and applies a scalar filter with sort and paging into the exact envelope", async () => {
    const page = await readUserPage(client, {
      filters: [{ field: "status", op: "eq", value: "active" }],
      sortBy: "name",
      order: "asc",
      page: 1,
      pageSize: 5,
    })

    // The offset envelope is exactly `{ data, pagination, facets? }` — no extra or renamed field.
    expect(Object.keys(page).sort()).toEqual(["data", "pagination"])
    expect(Object.keys(page.pagination).sort()).toEqual(["page", "pageSize", "total", "totalPages"])
    expect(page.pagination.page).toBe(1)
    expect(page.pagination.pageSize).toBe(5)
    expect(page.data.length).toBeLessThanOrEqual(5)
    // The mock parsed `status=eq.active` from the exact wire the builder emitted.
    expect(page.data.every((user) => user.status === "active")).toBe(true)
    const names = page.data.map((user) => user.name ?? "")
    expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
  })

  it("round-trips multi-segment tokens (in / nin / not.is.null) through the longest-first parse", async () => {
    const included = await readUserPage(client, {
      filters: [{ field: "role", op: "in", value: ["admin", "editor"] }],
      pageSize: 50,
    })
    expect(included.data.length).toBeGreaterThan(0)
    expect(included.data.every((user) => user.role === "admin" || user.role === "editor")).toBe(
      true,
    )

    const excluded = await readUserPage(client, {
      filters: [{ field: "role", op: "nin", value: ["admin", "editor"] }],
      pageSize: 50,
    })
    expect(excluded.data.every((user) => user.role !== "admin" && user.role !== "editor")).toBe(
      true,
    )

    // The longest-first parse must match `not.is.null` before `is.null`/`in`; every seeded user has
    // a `role`, so a presence check returns the whole set — its total equals the unfiltered total.
    const baseline = await readUserPage(client, { pageSize: 1 })
    const present = await readUserPage(client, {
      filters: [{ field: "role", op: "notNull" }],
      pageSize: 50,
    })
    expect(present.pagination.total).toBe(baseline.pagination.total)
    expect(present.data.every((user) => user.role !== undefined)).toBe(true)
  })

  it("rejects a malformed envelope at the schema boundary instead of trusting it", async () => {
    // A row with a mistyped field (`email` not a string) must fail validation, not cross as `User`.
    handle.server.use(
      http.get("http://mock.test/api/users", () =>
        HttpResponse.json({
          data: [{ id: "user_1", email: 42 }],
          pagination: { page: 1, pageSize: 5, total: 1, totalPages: 1 },
        }),
      ),
    )
    await expect(readUserPage(client, { pageSize: 5 })).rejects.toBeInstanceOf(HttpError)
  })

  it("rolls facet counts up alongside the page, summing to the unfiltered total", async () => {
    const page = await readUserPage(client, { pageSize: 5, facets: ["status"] })
    // With facets requested, the envelope carries exactly the third `facets` field.
    expect(Object.keys(page).sort()).toEqual(["data", "facets", "pagination"])
    expect(page.facets?.status).toBeDefined()
    // Each value's count sums to the unfiltered total (the `_total` roll-up entry is excluded).
    const byValue = Object.entries(page.facets?.status ?? {}).filter(
      ([value]) => value !== "_total",
    )
    const total = byValue.reduce((sum, [, count]) => sum + count, 0)
    expect(total).toBe(page.pagination.total)
  })
})
