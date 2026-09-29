import type { CacheInvalidator, CacheKey } from "@plainworks/std/seam"
import type { WebAbortSignal } from "@plainworks/std/web"
import { fakeCacheInvalidator } from "@plainworks/testkit"
import { QueryObserver } from "@tanstack/query-core"
import { describe, expect, it, vi } from "vitest"
import { createQueryClient } from "../query-client"
import { createCacheInvalidator } from "./invalidator"

interface Harness {
  readonly invalidator: CacheInvalidator
  seed(key: CacheKey): void
  isStale(key: CacheKey): boolean
}

function fakeHarness(): Harness {
  const cache = fakeCacheInvalidator()
  return { invalidator: cache, seed: cache.seed, isStale: cache.isStale }
}

function queryHarness(): Harness {
  const client = createQueryClient()
  return {
    invalidator: createCacheInvalidator(client),
    seed: (key) => client.setQueryData(key, "cached"),
    isStale: (key) =>
      client.getQueryCache().find({ queryKey: key, exact: true })?.state.isInvalidated ?? false,
  }
}

describe.each([
  ["fakeCacheInvalidator (testkit)", fakeHarness],
  ["createCacheInvalidator (query)", queryHarness],
])("CacheInvalidator contract: %s", (_name, harness) => {
  function seeded(): Harness {
    const cache = harness()
    cache.seed(["users"])
    cache.seed(["users", { id: 1 }])
    cache.seed(["posts"])
    return cache
  }

  it("treats a key as a prefix by default", async () => {
    const cache = seeded()
    await cache.invalidator.invalidate({ key: ["users"] })
    expect(cache.isStale(["users"])).toBe(true)
    expect(cache.isStale(["users", { id: 1 }])).toBe(true)
    expect(cache.isStale(["posts"])).toBe(false)
  })

  it("matches an object part by the fields it names", async () => {
    const cache = harness()
    cache.seed(["users", { id: 1, role: "admin" }])
    cache.seed(["users", { id: 2, role: "admin" }])
    await cache.invalidator.invalidate({ key: ["users", { id: 1 }] })
    expect(cache.isStale(["users", { id: 1, role: "admin" }])).toBe(true)
    expect(cache.isStale(["users", { id: 2, role: "admin" }])).toBe(false)
  })

  it("matches only the key itself when exact", async () => {
    const cache = seeded()
    await cache.invalidator.invalidate({ key: ["users"], exact: true })
    expect(cache.isStale(["users"])).toBe(true)
    expect(cache.isStale(["users", { id: 1 }])).toBe(false)
  })

  it("invalidates the whole cache when no key is given", async () => {
    const cache = seeded()
    await cache.invalidator.invalidate()
    expect(cache.isStale(["users", { id: 1 }])).toBe(true)
    expect(cache.isStale(["posts"])).toBe(true)
  })
})

describe("createCacheInvalidator", () => {
  it("cancels the matching refetch when the signal aborts", async () => {
    const client = createQueryClient()
    let refetchSignal: WebAbortSignal | undefined
    let calls = 0
    const observer = new QueryObserver(client, {
      queryKey: ["users", 1],
      queryFn: ({ signal }) => {
        calls += 1
        if (calls === 1) {
          return Promise.resolve("first")
        }
        refetchSignal = signal
        return new Promise<string>(() => {})
      },
      retry: false,
      staleTime: 0,
    })
    const unsubscribe = observer.subscribe(() => {})
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe("first"))

    const controller = new AbortController()
    const settled = createCacheInvalidator(client).invalidate(
      { key: ["users"] },
      { signal: controller.signal },
    )
    await vi.waitFor(() => expect(refetchSignal).toBeDefined())
    controller.abort()
    await settled

    expect(refetchSignal?.aborted).toBe(true)
    expect(client.getQueryData(["users", 1])).toBe("first")
    unsubscribe()
  })

  it("does nothing when the signal has already aborted", async () => {
    const client = createQueryClient()
    client.setQueryData(["users"], "cached")
    const controller = new AbortController()
    controller.abort()

    await createCacheInvalidator(client).invalidate(
      { key: ["users"] },
      { signal: controller.signal },
    )

    expect(client.getQueryCache().find({ queryKey: ["users"] })?.state.isInvalidated).toBe(false)
  })
})
