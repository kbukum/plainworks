import { deferred } from "@plainworks/testkit"
import { MutationObserver, type QueryClient } from "@tanstack/query-core"
import { describe, expect, it, vi } from "vitest"
import { createQueryClient } from "../query-client"
import { optimisticMutationOptions } from "./optimistic"

type Todos = readonly string[]

const KEY = ["todos"] as const

function seeded(value: Todos = ["a"]): QueryClient {
  const client = createQueryClient()
  client.setQueryData<Todos>(KEY, value)
  return client
}

function addTodo(client: QueryClient, write: (title: string) => Promise<string>) {
  return new MutationObserver(
    client,
    optimisticMutationOptions<string, string, Todos>({
      queryKey: KEY,
      mutationFn: write,
      apply: (todos, title) => (todos === undefined ? undefined : [...todos, title]),
    }),
  )
}

describe("optimisticMutationOptions", () => {
  it("applies the change before the write settles", async () => {
    const client = seeded()
    const write = deferred<string>()
    const pending = addTodo(client, () => write.promise).mutate("b")
    await vi.waitFor(() => expect(client.getQueryData(KEY)).toEqual(["a", "b"]))
    write.resolve("b")
    await pending
  })

  it("cancels in-flight reads so a stale response cannot overwrite the optimistic write", async () => {
    const client = seeded()
    const cancel = vi.spyOn(client, "cancelQueries")
    await addTodo(client, async (title) => title).mutate("b")
    expect(cancel).toHaveBeenCalledWith({ queryKey: KEY })
  })

  it("rolls back to the snapshot when the write fails", async () => {
    const client = seeded()
    const failure = new Error("rejected")
    await expect(addTodo(client, () => Promise.reject(failure)).mutate("b")).rejects.toBe(failure)
    expect(client.getQueryData(KEY)).toEqual(["a"])
  })

  it("keeps a newer write when an older one fails, then invalidates to re-sync", async () => {
    const client = seeded()
    const invalidate = vi.spyOn(client, "invalidateQueries")
    const first = deferred<string>()
    const firstRun = addTodo(client, () => first.promise).mutate("b")
    await vi.waitFor(() => expect(client.getQueryData(KEY)).toEqual(["a", "b"]))
    client.setQueryData<Todos>(KEY, ["a", "b", "live"])
    first.reject(new Error("rejected"))
    await expect(firstRun).rejects.toThrow("rejected")
    expect(client.getQueryData(KEY)).toEqual(["a", "b", "live"])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY })
  })

  it("invalidates once, after the last overlapping write settles", async () => {
    const client = seeded()
    const invalidate = vi.spyOn(client, "invalidateQueries")
    const first = deferred<string>()
    const second = deferred<string>()
    const firstRun = addTodo(client, () => first.promise).mutate("b")
    const secondRun = addTodo(client, () => second.promise).mutate("c")
    await vi.waitFor(() => expect(client.getQueryData(KEY)).toEqual(["a", "b", "c"]))

    first.resolve("b")
    await firstRun
    expect(invalidate).not.toHaveBeenCalled()

    second.resolve("c")
    await secondRun
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY })
  })

  it("skips the optimistic write when nothing is cached", async () => {
    const client = createQueryClient()
    const apply = vi.fn((todos: Todos | undefined, title: string) => [...(todos ?? []), title])
    const observer = new MutationObserver(
      client,
      optimisticMutationOptions<string, string, Todos>({
        queryKey: KEY,
        mutationFn: async (title) => title,
        apply,
      }),
    )
    await observer.mutate("b")
    expect(apply).not.toHaveBeenCalled()
    expect(client.getQueryData(KEY)).toBeUndefined()
  })

  it("folds the server's result into the cache on success", async () => {
    const client = seeded()
    const write = deferred<string>()
    const observer = new MutationObserver(
      client,
      optimisticMutationOptions<string, string, Todos>({
        queryKey: KEY,
        mutationFn: () => write.promise,
        apply: (todos, title) => (todos === undefined ? undefined : [...todos, `${title}…`]),
        reconcile: (todos, saved, title) => todos?.map((t) => (t === `${title}…` ? saved : t)),
      }),
    )
    const run = observer.mutate("b")
    await vi.waitFor(() => expect(client.getQueryData(KEY)).toEqual(["a", "b…"]))
    write.resolve("B")
    await run
    expect(client.getQueryData(KEY)).toEqual(["a", "B"])
  })

  it("runs writes sharing a scope one at a time, in call order", async () => {
    const client = seeded()
    const order: string[] = []
    const first = deferred<string>()
    const observer = () =>
      new MutationObserver(
        client,
        optimisticMutationOptions<string, string, Todos>({
          queryKey: KEY,
          scope: { id: "todos" },
          mutationFn: (title) => {
            order.push(`start ${title}`)
            return title === "b" ? first.promise : Promise.resolve(title)
          },
          apply: (todos, title) => (todos === undefined ? undefined : [...todos, title]),
        }),
      )
    const firstRun = observer().mutate("b")
    const secondRun = observer().mutate("c")
    await vi.waitFor(() => expect(order).toEqual(["start b"]))
    first.resolve("b")
    await Promise.all([firstRun, secondRun])
    expect(order).toEqual(["start b", "start c"])
  })

  it("keys the mutation by the query key", () => {
    const options = optimisticMutationOptions<string, string, Todos>({
      queryKey: KEY,
      mutationFn: async (title) => title,
      apply: (todos) => todos,
    })
    expect(options.mutationKey).toEqual(KEY)
  })

  it("re-syncs a parent and a child key that overlap in time", async () => {
    const client = createQueryClient()
    const CHILD = [...KEY, "done"] as const
    client.setQueryData<Todos>(KEY, ["a"])
    client.setQueryData<Todos>(CHILD, ["x"])
    const invalidate = vi.spyOn(client, "invalidateQueries")
    const observer = (queryKey: readonly string[], write: () => Promise<string>) =>
      new MutationObserver(
        client,
        optimisticMutationOptions<string, string, Todos>({
          queryKey,
          mutationFn: write,
          apply: (todos, title) => (todos === undefined ? undefined : [...todos, title]),
        }),
      )
    const child = deferred<string>()
    const childRun = observer(CHILD, () => child.promise).mutate("y")
    await observer(KEY, async () => "b").mutate("b")
    child.resolve("y")
    await childRun
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: CHILD })
  })
})
