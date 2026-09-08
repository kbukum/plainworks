import type { PlainEvent, WebAbortSignal } from "@plainworks/std"
import { QueryObserver } from "@tanstack/query-core"
import { describe, expect, it, vi } from "vitest"
import { createQueryClient } from "../query-client"
import { createQueryEventSink } from "./event-sink"

type UserEvent =
  | PlainEvent<"user.renamed", { id: number; name: string }>
  | PlainEvent<"user.touched">

describe("createQueryEventSink", () => {
  it("applies a `set` action, folding the payload into the cache", async () => {
    const client = createQueryClient()
    client.setQueryData(["user", 1], { id: 1, name: "old" })
    const sink = createQueryEventSink<UserEvent>(client, (event) =>
      event.type === "user.renamed"
        ? { kind: "set", queryKey: ["user", event.data.id], update: event.data }
        : undefined,
    )

    await sink.deliver({ type: "user.renamed", data: { id: 1, name: "new" } })
    expect(client.getQueryData(["user", 1])).toEqual({ id: 1, name: "new" })
  })

  it("applies an `invalidate` action", async () => {
    const client = createQueryClient()
    await client.query({ queryKey: ["user", 1], queryFn: async () => "ada" })
    const query = client.getQueryCache().find({ queryKey: ["user", 1] })
    const sink = createQueryEventSink<UserEvent>(client, () => ({
      kind: "invalidate",
      filters: { queryKey: ["user"], refetchType: "none" },
    }))

    await sink.deliver({ type: "user.touched", data: undefined })
    expect(query?.state.isInvalidated).toBe(true)
  })

  it("ignores an event the router drops", async () => {
    const client = createQueryClient()
    client.setQueryData(["user", 1], { id: 1, name: "keep" })
    const sink = createQueryEventSink<UserEvent>(client, () => undefined)

    await sink.deliver({ type: "user.touched", data: undefined })
    expect(client.getQueryData(["user", 1])).toEqual({ id: 1, name: "keep" })
  })

  it("drops a delivery whose signal already aborted (never mutates a torn-down cache)", async () => {
    const client = createQueryClient()
    client.setQueryData(["user", 1], { id: 1, name: "keep" })
    const sink = createQueryEventSink<UserEvent>(client, (event) =>
      event.type === "user.renamed"
        ? { kind: "set", queryKey: ["user", event.data.id], update: event.data }
        : undefined,
    )
    const controller = new AbortController()
    controller.abort()

    await sink.deliver({ type: "user.renamed", data: { id: 1, name: "new" } }, controller.signal)
    expect(client.getQueryData(["user", 1])).toEqual({ id: 1, name: "keep" })
  })

  it("drops the action when the router itself aborts the signal synchronously", async () => {
    // The router is user code: it may abort the supplied signal and still return an action. The
    // sink must re-check the signal after routing so a torn-down stream never mutates the cache.
    const client = createQueryClient()
    client.setQueryData(["user", 1], { id: 1, name: "keep" })
    const controller = new AbortController()
    const sink = createQueryEventSink<UserEvent>(client, () => {
      controller.abort()
      return { kind: "set", queryKey: ["user", 1], update: { id: 1, name: "new" } }
    })

    await sink.deliver({ type: "user.renamed", data: { id: 1, name: "new" } }, controller.signal)
    expect(client.getQueryData(["user", 1])).toEqual({ id: 1, name: "keep" })
  })

  it("cancels an in-flight refetch when the signal aborts mid-invalidation", async () => {
    const client = createQueryClient()
    let refetchSignal: WebAbortSignal | undefined
    let releaseRefetch: (value: string) => void = () => {}
    let calls = 0
    // An *active* query (an observer) so invalidation actually refetches; the refetch hangs on a
    // deferred promise and captures its abort signal, so we can prove the abort cancels it.
    const observer = new QueryObserver(client, {
      queryKey: ["user", 1],
      queryFn: ({ signal }) => {
        calls += 1
        if (calls === 1) return Promise.resolve("first")
        refetchSignal = signal
        return new Promise<string>((resolve) => {
          releaseRefetch = resolve
        })
      },
      retry: false,
      staleTime: 0,
      gcTime: Number.POSITIVE_INFINITY,
    })
    const unsubscribe = observer.subscribe(() => {})
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe("first"))

    const sink = createQueryEventSink<UserEvent>(client, () => ({
      kind: "invalidate",
      filters: { queryKey: ["user"] }, // default refetchType "active" → refetches the observed query
    }))
    const controller = new AbortController()
    const delivery = sink.deliver({ type: "user.touched", data: undefined }, controller.signal)

    // Once the refetch is in flight, abort mid-invalidation.
    await vi.waitFor(() => expect(refetchSignal).toBeDefined())
    controller.abort()
    await delivery
    releaseRefetch("second") // even if the fetch later resolves, it was already cancelled

    expect(refetchSignal?.aborted).toBe(true)
    unsubscribe()
  })
})
