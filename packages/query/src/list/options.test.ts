import type { CursorResult, ListQueryParams, PaginatedResult } from "@plainworks/std"
import { describe, expect, it } from "vitest"
import { createQueryClient } from "../query-client"
import { infiniteListQueryOptions, listQueryOptions } from "./options"

interface Item {
  readonly id: number
}

describe("listQueryOptions", () => {
  it("pairs a deterministic key with a fetch of exactly those params", async () => {
    const client = createQueryClient()
    const params: ListQueryParams = { page: 1, pageSize: 2 }
    let seen: ListQueryParams | undefined
    const plan = listQueryOptions<Item>({
      resource: "items",
      params,
      fetch: async (p) => {
        seen = p
        return {
          data: [{ id: 1 }, { id: 2 }],
          pagination: { page: 1, pageSize: 2, total: 2, totalPages: 1 },
        }
      },
    })

    const result = await client.query(plan)
    expect(seen).toEqual(params)
    expect(result.data).toEqual([{ id: 1 }, { id: 2 }])
    expect(client.getQueryData<PaginatedResult<Item>>(plan.queryKey)?.pagination.total).toBe(2)
  })

  it("threads TanStack's abort signal into the fetch", async () => {
    const client = createQueryClient()
    let seenSignal: unknown
    const plan = listQueryOptions<Item>({
      resource: "items",
      params: { page: 1 },
      fetch: async (_p, signal) => {
        seenSignal = signal
        return {
          data: [],
          pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
        }
      },
    })
    await client.query(plan)
    expect(seenSignal).toBeDefined()
    expect(typeof (seenSignal as { aborted: boolean }).aborted).toBe("boolean")
  })

  it("strips a caller-supplied cursor so offset plans differing only by cursor never collide", async () => {
    let seen: ListQueryParams | undefined
    const make = (cursor: string) =>
      listQueryOptions<Item>({
        resource: "items",
        params: { page: 1, cursor },
        fetch: async (p) => {
          seen = p
          return { data: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } }
        },
      })
    const a = make("a")
    const b = make("b")
    // Same offset request → identical key regardless of a stray cursor, and the fetch never sees it.
    expect(a.queryKey).toEqual(b.queryKey)
    const client = createQueryClient()
    await client.query(a)
    expect(seen?.cursor).toBeUndefined()
  })
})

describe("infiniteListQueryOptions", () => {
  it("round-trips cursor pages against the canonical cursor envelope", async () => {
    // Three pages linked by cursor, terminating on `nextCursor: null`. The first page carries an
    // empty cursor — the explicit wire signal that selects cursor mode from the first request.
    const pages: Record<string, CursorResult<Item>> = {
      "": { data: [{ id: 1 }], pagination: { pageSize: 1, nextCursor: "c2", prevCursor: null } },
      c2: { data: [{ id: 2 }], pagination: { pageSize: 1, nextCursor: "c3", prevCursor: "c1" } },
      c3: { data: [{ id: 3 }], pagination: { pageSize: 1, nextCursor: null, prevCursor: "c2" } },
    }
    const client = createQueryClient()
    const requested: Array<string | undefined> = []
    const plan = infiniteListQueryOptions<Item>({
      resource: "items",
      params: { pageSize: 1 },
      fetch: async (p) => {
        requested.push(p.cursor)
        const page = pages[p.cursor ?? "missing"]
        if (page === undefined) {
          throw new Error(`no fixture page for cursor ${String(p.cursor)}`)
        }
        return page
      },
    })

    await client.infiniteQuery({ ...plan, pages: 3 })

    // Cursors were threaded from each page's `nextCursor`, and every page's rows were collected in order.
    expect(requested).toEqual(["", "c2", "c3"])
    const data = client.getQueryData<{ pages: CursorResult<Item>[] }>(plan.queryKey)
    expect(data?.pages.flatMap((page) => page.data.map((item) => item.id))).toEqual([1, 2, 3])
  })

  it("reports no next page at the end and threads the previous cursor", async () => {
    const last: CursorResult<Item> = {
      data: [{ id: 9 }],
      pagination: { pageSize: 1, nextCursor: null, prevCursor: "c8" },
    }
    const plan = infiniteListQueryOptions<Item>({
      resource: "items",
      params: { pageSize: 1 },
      fetch: async () => last,
    })
    expect(plan.getNextPageParam(last)).toBeUndefined()
    expect(plan.getPreviousPageParam(last)).toBe("c8")
    expect(plan.initialPageParam).toBeUndefined()
  })

  it("seeds an explicit initial cursor and reports no previous page at the start", () => {
    const start: CursorResult<Item> = {
      data: [{ id: 1 }],
      pagination: { pageSize: 1, nextCursor: "c2", prevCursor: null },
    }
    const plan = infiniteListQueryOptions<Item>({
      resource: "items",
      params: { pageSize: 1 },
      initialCursor: "c0",
      fetch: async () => start,
    })
    expect(plan.initialPageParam).toBe("c0")
    expect(plan.getPreviousPageParam(start)).toBeUndefined()
  })

  it("strips a caller-supplied params.cursor so an untracked initial cursor never leaks", async () => {
    const client = createQueryClient()
    let firstFetchParams: ListQueryParams | undefined
    const plan = infiniteListQueryOptions<Item>({
      resource: "items",
      params: { pageSize: 1, cursor: "caller-supplied" },
      fetch: async (p) => {
        firstFetchParams ??= p
        return {
          data: [{ id: 1 }],
          pagination: { pageSize: 1, nextCursor: null, prevCursor: null },
        }
      },
    })
    await client.infiniteQuery({ ...plan, pages: 1 })
    // The initial page must NOT carry the caller's cursor — the cursor is the page param, empty on
    // the first page (the explicit cursor-mode signal).
    expect(firstFetchParams?.cursor).toBe("")
  })

  it("strips a caller-supplied page (offset has no meaning in cursor mode)", async () => {
    const client = createQueryClient()
    let firstFetchParams: ListQueryParams | undefined
    const plan = infiniteListQueryOptions<Item>({
      resource: "items",
      params: { pageSize: 1, page: 5 },
      fetch: async (p) => {
        firstFetchParams ??= p
        return {
          data: [{ id: 1 }],
          pagination: { pageSize: 1, nextCursor: null, prevCursor: null },
        }
      },
    })
    await client.infiniteQuery({ ...plan, pages: 1 })
    expect(firstFetchParams?.page).toBeUndefined()
  })

  it("keys distinctly by initialCursor so plans at different cursors never share a cache entry", async () => {
    const client = createQueryClient()
    const a = infiniteListQueryOptions<Item>({
      resource: "items",
      params: { pageSize: 1 },
      initialCursor: "c0",
      fetch: async () => ({
        data: [{ id: 1 }],
        pagination: { pageSize: 1, nextCursor: null, prevCursor: null },
      }),
    })
    const b = infiniteListQueryOptions<Item>({
      resource: "items",
      params: { pageSize: 1 },
      initialCursor: "c9",
      fetch: async () => ({
        data: [{ id: 9 }],
        pagination: { pageSize: 1, nextCursor: null, prevCursor: null },
      }),
    })
    expect(a.queryKey).not.toEqual(b.queryKey)
    await client.infiniteQuery({ ...a, pages: 1 })
    expect(client.getQueryData(a.queryKey)).toBeDefined()
    expect(client.getQueryData(b.queryKey)).toBeUndefined()
  })

  it("keys an omitted and an empty initial cursor identically — both fetch the same first page", () => {
    const fetch = async (): Promise<CursorResult<Item>> => ({
      data: [],
      pagination: { pageSize: 1, nextCursor: null, prevCursor: null },
    })
    const omitted = infiniteListQueryOptions<Item>({ resource: "items", params: {}, fetch })
    const empty = infiniteListQueryOptions<Item>({
      resource: "items",
      params: {},
      initialCursor: "",
      fetch,
    })
    expect(omitted.queryKey).toEqual(empty.queryKey)
  })

  it("threads TanStack's abort signal into the infinite fetch", async () => {
    const client = createQueryClient()
    let seenSignal: unknown
    const plan = infiniteListQueryOptions<Item>({
      resource: "items",
      params: { pageSize: 1 },
      fetch: async (_p, signal) => {
        seenSignal = signal
        return {
          data: [],
          pagination: { pageSize: 1, nextCursor: null, prevCursor: null },
        }
      },
    })
    await client.infiniteQuery({ ...plan, pages: 1 })
    expect(seenSignal).toBeDefined()
    expect(typeof (seenSignal as { aborted: boolean }).aborted).toBe("boolean")
  })
})
