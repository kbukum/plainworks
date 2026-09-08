import { describe, expect, it, vi } from "vitest"
import { createQueryClient } from "../query-client"
import { createRemoteScope } from "./scope"
import { createRemoteSource, REMOTE_CAPABILITIES } from "./source"

describe("createRemoteSource", () => {
  it("reads, writes, and evicts a slot through the query cache", async () => {
    const client = createQueryClient()
    const source = createRemoteSource<number>(client, ["slot"])

    expect(await source.get()).toBeUndefined()
    await source.set(7)
    expect(client.getQueryData(["slot"])).toBe(7)
    expect(await source.get()).toBe(7)
    await source.remove()
    expect(client.getQueryData(["slot"])).toBeUndefined()
  })

  it("notifies only when THIS slot changes, and tears down on unsubscribe", async () => {
    const client = createQueryClient()
    const source = createRemoteSource<number>(client, ["slot"])
    let changes = 0
    const subscription = source.subscribe(() => {
      changes += 1
    })

    await source.set(1)
    client.setQueryData(["other"], 99) // unrelated slot — must not notify
    expect(changes).toBe(1)

    subscription.unsubscribe()
    await source.set(2)
    expect(changes).toBe(1)
  })

  it("notifies on a data write but not on invalidation/fetch bookkeeping", async () => {
    const client = createQueryClient()
    const source = createRemoteSource<number>(client, ["slot"])
    let changes = 0
    const subscription = source.subscribe(() => {
      changes += 1
    })

    await source.set(1) // successful write → one notify
    expect(changes).toBe(1)

    // Marking the slot stale is bookkeeping, not a data change — it must not notify until a refetch
    // actually writes new data.
    await client.invalidateQueries({ queryKey: ["slot"], refetchType: "none" })
    expect(changes).toBe(1)

    subscription.unsubscribe()
  })

  it("respects a custom queryKeyHashFn on the client", async () => {
    const { QueryClient } = await import("@tanstack/query-core")
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          queryKeyHashFn: (key) => `custom:${JSON.stringify(key)}`,
        },
      },
    })
    const source = createRemoteSource<number>(client, ["slot"])
    let changes = 0
    const subscription = source.subscribe(() => {
      changes += 1
    })
    await source.set(42)
    expect(changes).toBe(1)
    expect(await source.get()).toBe(42)
    subscription.unsubscribe()
  })

  it("resolves the hash through per-key defaults (`setQueryDefaults`), not only global ones", async () => {
    // `setQueryDefaults` can supply a `queryKeyHashFn` for a key prefix; the source's event
    // matching must hash through the merged defaults or it never sees this slot's events.
    const client = createQueryClient()
    client.setQueryDefaults(["slot"], {
      queryKeyHashFn: (key) => `scoped:${JSON.stringify(key)}`,
    })
    const source = createRemoteSource<number>(client, ["slot"])
    let changes = 0
    const subscription = source.subscribe(() => {
      changes += 1
    })
    await source.set(42)
    expect(changes).toBe(1)
    expect(await source.get()).toBe(42)
    subscription.unsubscribe()
  })

  it("keeps a re-written slot pinned across eviction (remove → rewrite → past gcTime)", async () => {
    vi.useFakeTimers()
    try {
      const { QueryClient } = await import("@tanstack/query-core")
      const client = new QueryClient({ defaultOptions: { queries: { gcTime: 1000 } } })
      const source = createRemoteSource<number>(client, ["slot"])
      await source.set(7)
      let changes = 0
      const subscription = source.subscribe(() => {
        changes += 1
      })

      // Eviction destroys the query object; the rewrite creates a *new* one with the same hash.
      await source.remove()
      expect(changes).toBe(1)
      await source.set(9)
      expect(changes).toBe(2)

      // The pin must have rebound to the replacement — past gcTime the value is still cached.
      vi.advanceTimersByTime(2000)
      expect(client.getQueryData(["slot"])).toBe(9)

      subscription.unsubscribe()
      vi.advanceTimersByTime(2000)
      expect(client.getQueryData(["slot"])).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it("pins the slot against garbage collection for the lifetime of a subscription", async () => {
    vi.useFakeTimers()
    try {
      const { QueryClient } = await import("@tanstack/query-core")
      const client = new QueryClient({ defaultOptions: { queries: { gcTime: 1000 } } })
      const source = createRemoteSource<number>(client, ["slot"])
      await source.set(7)
      const subscription = source.subscribe(() => {})

      // Past gcTime, a `setQueryData`-only value would normally be collected — the subscription's
      // pin keeps it alive while the scoped-state Provider is mounted.
      vi.advanceTimersByTime(2000)
      expect(client.getQueryData(["slot"])).toBe(7)

      // Unsubscribing releases the pin: the next gc cycle collects the slot (and its `removed`
      // event resets the mirror).
      subscription.unsubscribe()
      vi.advanceTimersByTime(2000)
      expect(client.getQueryData(["slot"])).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it("notifies a subscriber when the slot is evicted, so the mirror reconciles the clear", async () => {
    const client = createQueryClient()
    const source = createRemoteSource<number>(client, ["slot"])
    await source.set(7)
    let changes = 0
    const subscription = source.subscribe(() => {
      changes += 1
    })

    // Eviction is a data change (the value is gone) — a subscribed mirror must wake and reset.
    await source.remove()
    expect(changes).toBe(1)
    expect(await source.get()).toBeUndefined()
    subscription.unsubscribe()
  })

  it("declares remote, async, non-durable capabilities", () => {
    expect(REMOTE_CAPABILITIES).toMatchObject({
      authority: "remote",
      access: "async",
      durable: false,
    })
  })
})

describe("createRemoteScope", () => {
  it("builds sources under a namespacing prefix and reports remote capabilities", async () => {
    const client = createQueryClient()
    const scope = createRemoteScope({ client })
    expect(scope.name).toBe("remote")
    expect(scope.capabilities.authority).toBe("remote")

    const source = scope.createSource<string>({ key: "theme", serializer: passthrough() })
    await source.set("dark")
    expect(client.getQueryData(["plainworks", "remote", "theme"])).toBe("dark")
  })

  it("honors a custom key prefix", async () => {
    const client = createQueryClient()
    const scope = createRemoteScope({ client, keyPrefix: ["app", "remote"] })
    const source = scope.createSource<string>({ key: "theme", serializer: passthrough() })
    await source.set("light")
    expect(client.getQueryData(["app", "remote", "theme"])).toBe("light")
  })
})

/** A no-op serializer — the remote scope holds a live reference and ignores it (like `memory`). */
function passthrough<Value>() {
  return {
    serialize: (value: Value) => String(value),
    deserialize: (raw: string) => raw as unknown as Value,
  }
}
