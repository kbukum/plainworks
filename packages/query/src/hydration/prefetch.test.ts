import { describe, expect, it } from "vitest"
import { createQueryClient } from "../query-client"
import { dehydrateClient, hydrateClient, prefetchInfiniteQuery, prefetchQuery } from "./prefetch"

describe("hydration", () => {
  it("prefetches on a server client, dehydrates, and rehydrates into a fresh client with no refetch", async () => {
    const server = createQueryClient()
    let serverFetches = 0
    const outcome = await prefetchQuery<string>(server, {
      queryKey: ["greeting"],
      queryFn: async () => {
        serverFetches += 1
        return "hello"
      },
    })
    expect(outcome).toEqual({ status: "warmed" })
    expect(serverFetches).toBe(1)

    const state = dehydrateClient(server, { shouldDehydrateQuery: () => true })
    const browser = createQueryClient()
    hydrateClient(browser, state)

    // The value is warm in the rehydrated client — read straight from the cache, no second fetch.
    expect(browser.getQueryData(["greeting"])).toBe("hello")
    expect(serverFetches).toBe(1)
  })

  it("returns a `failed` outcome carrying the cause instead of rejecting or swallowing it", async () => {
    const server = createQueryClient()
    const cause = new Error("backend down")
    const outcome = await prefetchQuery<string>(server, {
      queryKey: ["broken"],
      queryFn: async () => {
        throw cause
      },
    })
    expect(outcome).toEqual({ status: "failed", cause })
    // A failed query is NOT dehydrated under a success-only policy, so the browser mounts it cold
    // rather than inheriting a broken server state.
    expect(
      dehydrateClient(server, {
        shouldDehydrateQuery: (query) => query.state.status === "success",
      }).queries,
    ).toHaveLength(0)
  })

  it("returns a `failed` outcome for an infinite prefetch that rejects", async () => {
    const server = createQueryClient()
    const cause = new Error("feed down")
    const outcome = await prefetchInfiniteQuery<{ items: number[]; next: string | null }>(server, {
      queryKey: ["feed"],
      queryFn: async () => {
        throw cause
      },
      initialPageParam: undefined,
      getNextPageParam: (last: { items: number[]; next: string | null }) => last.next ?? undefined,
    })
    expect(outcome).toEqual({ status: "failed", cause })
  })

  it("forwards dehydration options so server-only queries stay out of the RSC payload", async () => {
    const server = createQueryClient()
    await prefetchQuery<string>(server, { queryKey: ["public"], queryFn: async () => "ship me" })
    await prefetchQuery<string>(server, { queryKey: ["internal"], queryFn: async () => "secret" })

    // An allowlist filter keeps the server-only query out of the dehydrated state entirely.
    const state = dehydrateClient(server, {
      shouldDehydrateQuery: (query) => query.queryKey[0] === "public",
    })
    const browser = createQueryClient()
    hydrateClient(browser, state)

    expect(browser.getQueryData(["public"])).toBe("ship me")
    expect(browser.getQueryData(["internal"])).toBeUndefined()
  })

  it("prefetches an infinite query into the dehydrated state", async () => {
    const server = createQueryClient()
    await prefetchInfiniteQuery<{ items: number[]; next: string | null }>(server, {
      queryKey: ["feed"],
      queryFn: async () => ({ items: [1, 2], next: null }),
      initialPageParam: undefined,
      getNextPageParam: (last: { items: number[]; next: string | null }) => last.next ?? undefined,
    })

    const browser = createQueryClient()
    hydrateClient(browser, dehydrateClient(server, { shouldDehydrateQuery: () => true }))
    expect(browser.getQueryData(["feed"])).toMatchObject({ pages: [{ items: [1, 2] }] })
  })
})
