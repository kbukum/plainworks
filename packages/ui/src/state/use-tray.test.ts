// @vitest-environment jsdom

import type { StateSource } from "@plainworks/std/seam"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { useTray } from "./use-tray"

interface Item {
  readonly id: string
}

afterEach(cleanup)

const key = (item: Item) => item.id
const a = { id: "a" }
const b = { id: "b" }
const c = { id: "c" }

function fakeSource(
  initial: readonly Item[] | undefined,
  fail?: { read?: boolean; write?: boolean },
) {
  let value = initial
  const listeners = new Set<() => void>()
  const source: StateSource<readonly Item[]> & {
    external: (next: readonly Item[]) => void
    stored: () => readonly Item[] | undefined
  } = {
    capabilities: {
      access: "sync",
      authority: "local",
      durable: true,
      sharedAcrossTabs: false,
      sentToServer: false,
      availableAtImport: false,
    },
    get: async () => {
      if (fail?.read === true) throw new Error("tampered")
      return value
    },
    set: async (next) => {
      if (fail?.write === true) throw new Error("quota")
      value = next
      for (const listener of listeners) listener()
    },
    remove: async () => {
      value = undefined
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return { unsubscribe: () => listeners.delete(listener) }
    },
    external: (next) => {
      value = next
      for (const listener of listeners) listener()
    },
    stored: () => value,
  }
  return source
}

describe("useTray in memory", () => {
  it("keeps pick order, ignores duplicates and stops at the limit", () => {
    const { result } = renderHook(() => useTray({ getKey: key, limit: 2 }))
    expect(result.current.ready).toBe(true)
    expect(result.current.touched).toBe(false)

    act(() => {
      expect(result.current.add(b)).toBe(true)
    })
    act(() => {
      expect(result.current.add(b)).toBe(false)
      expect(result.current.add(a)).toBe(true)
    })
    expect(result.current.items).toEqual([b, a])
    expect(result.current.full).toBe(true)
    expect(result.current.touched).toBe(true)
    act(() => {
      expect(result.current.add(c)).toBe(false)
    })
    expect(result.current.has("a")).toBe(true)
    expect(result.current.has("c")).toBe(false)
  })

  it("removes, replaces within the limit and clears", () => {
    const { result } = renderHook(() => useTray({ getKey: key, limit: 2 }))
    act(() => result.current.replace([a, b, a, c]))
    expect(result.current.items).toEqual([a, b])
    act(() => result.current.remove("a"))
    expect(result.current.items).toEqual([b])
    act(() => result.current.clear())
    expect(result.current.items).toEqual([])
    expect(result.current.touched).toBe(true)
  })

  it("rejects a limit that is not a positive integer", () => {
    expect(() => renderHook(() => useTray({ getKey: key, limit: 0 }))).toThrow(RangeError)
  })
})

describe("useTray over a source", () => {
  it("reads a stored tray and knows an empty slot was never touched", async () => {
    const kept = fakeSource([a])
    const stored = renderHook(() => useTray({ getKey: key, source: kept }))
    await waitFor(() => expect(stored.result.current.ready).toBe(true))
    expect(stored.result.current.items).toEqual([a])
    expect(stored.result.current.touched).toBe(true)

    const blank = fakeSource(undefined)
    const empty = renderHook(() => useTray({ getKey: key, source: blank }))
    await waitFor(() => expect(empty.result.current.ready).toBe(true))
    expect(empty.result.current.touched).toBe(false)
  })

  it("remembers a cleared tray as touched", async () => {
    const source = fakeSource([a])
    const { result } = renderHook(() => useTray({ getKey: key, source }))
    await waitFor(() => expect(result.current.ready).toBe(true))
    act(() => result.current.clear())
    await waitFor(() => expect(source.stored()).toEqual([]))
    const again = renderHook(() => useTray({ getKey: key, source }))
    await waitFor(() => expect(again.result.current.ready).toBe(true))
    expect(again.result.current.items).toEqual([])
    expect(again.result.current.touched).toBe(true)
  })

  it("follows a change made elsewhere", async () => {
    const source = fakeSource([a])
    const { result } = renderHook(() => useTray({ getKey: key, source }))
    await waitFor(() => expect(result.current.ready).toBe(true))
    act(() => source.external([b, c]))
    await waitFor(() => expect(result.current.items).toEqual([b, c]))
  })

  it("keeps a pick made before the stored tray was read", async () => {
    const source = fakeSource([a])
    const { result } = renderHook(() => useTray({ getKey: key, source }))
    act(() => {
      result.current.add(c)
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.items).toEqual([c])
  })

  it("reports a failed read or write instead of hiding it", async () => {
    const broken = fakeSource([a], { read: true })
    const unreadable = renderHook(() => useTray({ getKey: key, source: broken }))
    await waitFor(() => expect(unreadable.result.current.error).toBeInstanceOf(Error))
    expect(unreadable.result.current.ready).toBe(true)
    expect(unreadable.result.current.items).toEqual([])

    const quota = fakeSource([], { write: true })
    const full = renderHook(() => useTray({ getKey: key, source: quota }))
    await waitFor(() => expect(full.result.current.ready).toBe(true))
    act(() => {
      full.result.current.add(a)
    })
    await waitFor(() => expect(full.result.current.error).toBeInstanceOf(Error))
  })
  it("keeps picks when slow writes finish out of order", async () => {
    // Each write waits until the test releases it, newest first, and each one notifies.
    let value: readonly Item[] | undefined
    const listeners = new Set<() => void>()
    const held: (() => void)[] = []
    const source: StateSource<readonly Item[]> = {
      capabilities: {
        access: "async",
        authority: "local",
        durable: true,
        sharedAcrossTabs: false,
        sentToServer: false,
        availableAtImport: false,
      },
      get: async () => value,
      set: (next) =>
        new Promise<void>((resolve) => {
          held.push(() => {
            value = next
            for (const listener of listeners) listener()
            resolve()
          })
        }),
      remove: async () => undefined,
      subscribe: (listener) => {
        listeners.add(listener)
        return { unsubscribe: () => listeners.delete(listener) }
      },
    }
    const { result } = renderHook(() => useTray({ getKey: key, source }))
    await waitFor(() => expect(result.current.ready).toBe(true))
    act(() => {
      result.current.add(a)
    })
    act(() => {
      result.current.add(b)
    })
    while (held.length > 0) {
      await act(async () => {
        held.pop()?.()
        await Promise.resolve()
      })
    }
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    })
    expect(value).toEqual([a, b])
    expect(result.current.items).toEqual([a, b])
  })

  it("starts afresh on a new source and keeps each source's writes its own", async () => {
    // Source A holds its writes until the test releases them.
    let first: readonly Item[] | undefined = [a]
    const held: (() => void)[] = []
    const slow: StateSource<readonly Item[]> = {
      ...fakeSource(undefined),
      get: async () => first,
      set: (next) =>
        new Promise<void>((resolve) => {
          held.push(() => {
            first = next
            resolve()
          })
        }),
    }
    const other = fakeSource([c])
    const { result, rerender } = renderHook(
      ({ source }: { source: StateSource<readonly Item[]> }) => useTray({ getKey: key, source }),
      { initialProps: { source: slow } },
    )
    await waitFor(() => expect(result.current.ready).toBe(true))
    act(() => {
      result.current.add(b)
    })
    rerender({ source: other })
    expect(result.current.items).toEqual([])
    expect(result.current.ready).toBe(false)
    await waitFor(() => expect(result.current.items).toEqual([c]))
    act(() => {
      result.current.add(a)
    })
    await act(async () => {
      held.shift()?.()
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    })
    expect(first).toEqual([a, b])
    await waitFor(() => expect(other.stored()).toEqual([c, a]))
    expect(result.current.items).toEqual([c, a])
  })
})
