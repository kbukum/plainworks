import { deferred, flushMicrotasks, manualDelay } from "@plainworks/testkit"
import { describe, expect, it } from "vitest"
import { createQueryClient } from "../query-client"
import { createRemoteSource } from "../remote/source"
import { createLiveQuery } from "./live-query"

const backoff = { baseMs: 0, maxMs: 0, factor: 1, jitter: "none" } as const
const signal = new AbortController().signal

describe("live snapshot ownership", () => {
  it("100 remote-subscriber cycles release observers, callbacks, and pending snapshot timers", async () => {
    const client = createQueryClient()
    const delay = manualDelay()
    for (let cycle = 0; cycle < 100; cycle++) {
      const pending = deferred<number>()
      const live = createLiveQuery(
        client,
        {
          queryKey: ["items"],
          queryFn: () => pending.promise,
        },
        { backoff, delay: delay.delay },
      )
      const source = createRemoteSource<number>(client, ["items"])
      const listener = source.subscribe(() => {})
      live.connected(signal)
      await flushMicrotasks()
      listener.unsubscribe()
      live.close()
      pending.resolve(cycle)
      await flushMicrotasks()
      expect(delay.pending).toHaveLength(0)
      expect(client.getQueryCache().hasListeners()).toBe(false)
      expect(
        client
          .getQueryCache()
          .find({ queryKey: ["items"] })
          ?.getObserversCount(),
      ).toBe(0)
      expect(client.getQueryData(["items"])).toBeUndefined()
    }
    client.clear()
  })

  it("owns external invalidations even while a fresh-state listener is running", async () => {
    const client = createQueryClient()
    let calls = 0
    const live = createLiveQuery(
      client,
      {
        queryKey: ["items"],
        queryFn: async () => ++calls,
      },
      { backoff },
    )
    const listener = live.subscribe(() => {
      if (live.status === "fresh" && calls === 1)
        void client.invalidateQueries({ queryKey: ["items"] })
    })
    live.connected(signal)
    await flushMicrotasks()
    await flushMicrotasks()
    expect(calls).toBe(2)
    expect(client.getQueryData(["items"])).toBe(2)
    expect(client.getQueryState(["items"])?.isInvalidated).toBe(false)
    listener.unsubscribe()
    live.close()
    await client.invalidateQueries({ queryKey: ["items"] })
    expect(calls).toBe(2)
    client.clear()
  })

  it("subscribes before fetching and refreshes a remote-only consumer after coalesced resets", async () => {
    const client = createQueryClient()
    let calls = 0
    const live = createLiveQuery(
      client,
      {
        queryKey: ["items"],
        queryFn: async () => ++calls,
      },
      { backoff },
    )
    const source = createRemoteSource<number>(client, ["items"])
    const subscription = source.subscribe(() => {})
    expect(calls).toBe(0)
    live.connected(signal)
    await flushMicrotasks()
    expect(await source.get()).toBe(1)
    live.reset(signal)
    live.reset(signal)
    await flushMicrotasks()
    expect(await source.get()).toBe(2)
    expect(calls).toBe(2)
    subscription.unsubscribe()
    live.close()
    client.clear()
  })

  it("cannot accept a snapshot raced by a newer event, even if the fetch ignores cancellation", async () => {
    const client = createQueryClient()
    client.setQueryData(["items"], "cached")
    const old = deferred<string>()
    let calls = 0
    const live = createLiveQuery(
      client,
      {
        queryKey: ["items"],
        queryFn: () => (++calls === 1 ? old.promise : Promise.resolve("new")),
      },
      { backoff },
    )
    live.connected(signal)
    await flushMicrotasks()
    live.deliver({ type: "changed", data: {} }, signal)
    old.resolve("old")
    await flushMicrotasks()
    await flushMicrotasks()
    expect(client.getQueryData(["items"])).toBe("new")
    expect(calls).toBe(2)
    expect(live.status).toBe("fresh")
    live.close()
    client.clear()
  })

  it("stops at two snapshots under continuous churn and exposes stale state", async () => {
    const client = createQueryClient()
    client.setQueryData(["items"], "cached")
    const requests = [deferred<string>(), deferred<string>()]
    let calls = 0
    const live = createLiveQuery(
      client,
      {
        queryKey: ["items"],
        queryFn: () => {
          const request = requests[calls++]
          if (!request) throw new Error("Budget exceeded")
          return request.promise
        },
      },
      { backoff, maxRefetches: 2 },
    )
    live.connected(signal)
    await flushMicrotasks()
    live.deliver({ type: "changed", data: {} }, signal)
    requests[0]?.resolve("old")
    await flushMicrotasks()
    live.reset(signal)
    requests[1]?.resolve("also old")
    await flushMicrotasks()
    live.reset(signal)
    await flushMicrotasks()
    expect(calls).toBe(2)
    expect(live.status).toBe("stale")
    expect(client.getQueryData(["items"])).toBe("cached")
    expect(client.getQueryState(["items"])?.isInvalidated).toBe(true)
    live.close()
    client.clear()
  })

  it("refetches on reconnect after the snapshot settled, since controls carry no resume cursor", async () => {
    const client = createQueryClient()
    let calls = 0
    const live = createLiveQuery(
      client,
      { queryKey: ["items"], queryFn: async () => ++calls },
      { backoff },
    )
    live.connected(signal)
    await flushMicrotasks()
    await flushMicrotasks()
    expect(calls).toBe(1)
    expect(live.status).toBe("fresh")
    // A dropped-then-reestablished connection is a new subscription with no replay, so trusting the
    // old snapshot would silently miss offline changes — reconcile by refetching.
    live.connected(signal)
    await flushMicrotasks()
    await flushMicrotasks()
    expect(calls).toBe(2)
    expect(live.status).toBe("fresh")
    live.close()
    client.clear()
  })

  it("discards a pre-reconnect snapshot and coalesces boundaries into one follow-up fetch", async () => {
    const client = createQueryClient()
    client.setQueryData(["items"], 0)
    const pending = [deferred<number>(), deferred<number>()]
    let calls = 0
    const live = createLiveQuery(
      client,
      { queryKey: ["items"], queryFn: () => pending[calls++]?.promise ?? Promise.reject() },
      { backoff },
    )
    live.connected(signal)
    await flushMicrotasks()
    live.connected(signal)
    live.connected(signal)
    await flushMicrotasks()
    expect(calls).toBe(2)
    pending[0]?.resolve(1)
    await flushMicrotasks()
    await flushMicrotasks()
    expect(calls).toBe(2)
    expect(client.getQueryData(["items"])).toBe(0)
    expect(live.status).toBe("refreshing")
    pending[1]?.resolve(2)
    await flushMicrotasks()
    await flushMicrotasks()
    expect(client.getQueryData(["items"])).toBe(2)
    expect(live.status).toBe("fresh")
    live.close()
    client.clear()
  })

  it("does not reset the recovery budget when every snapshot races a reconnect", async () => {
    const client = createQueryClient()
    client.setQueryData(["items"], 0)
    const pending = [deferred<number>(), deferred<number>()]
    let calls = 0
    const live = createLiveQuery(
      client,
      { queryKey: ["items"], queryFn: () => pending[calls++]?.promise ?? Promise.reject() },
      { backoff, maxRefetches: 2 },
    )
    live.connected(signal)
    await flushMicrotasks()
    live.connected(signal)
    pending[0]?.resolve(1)
    await flushMicrotasks()
    await flushMicrotasks()
    live.connected(signal)
    pending[1]?.resolve(2)
    await flushMicrotasks()
    await flushMicrotasks()
    live.connected(signal)
    await flushMicrotasks()
    expect(calls).toBe(2)
    expect(client.getQueryData(["items"])).toBe(0)
    expect(live.status).toBe("stale")
    expect(live.error).toBeDefined()
    live.close()
    client.clear()
  })
})
