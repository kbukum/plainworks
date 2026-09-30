// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { useListState } from "./use-list-state"

afterEach(cleanup)

describe("useListState", () => {
  it("appends, prepends, and inserts at an index", () => {
    const { result } = renderHook(() => useListState<number>({ defaultValue: [2, 3] }))

    act(() => result.current.append(4))
    act(() => result.current.prepend(1))
    act(() => result.current.insert(2, 99))
    expect(result.current.items).toEqual([1, 2, 99, 3, 4])
  })

  it("composes multiple appends batched within one event", () => {
    const { result } = renderHook(() => useListState<number>({ defaultValue: [] }))
    act(() => {
      result.current.append(1)
      result.current.append(2)
    })
    expect(result.current.items).toEqual([1, 2])
  })

  it("clamps an out-of-range insert to the ends instead of tearing a hole", () => {
    const { result } = renderHook(() => useListState<number>({ defaultValue: [1, 2] }))
    act(() => result.current.insert(-5, 0))
    act(() => result.current.insert(100, 9))
    expect(result.current.items).toEqual([0, 1, 2, 9])
  })

  it("updates, removes, moves, and clears", () => {
    const { result } = renderHook(() => useListState<string>({ defaultValue: ["a", "b", "c"] }))

    act(() => result.current.updateAt(1, "B"))
    expect(result.current.items).toEqual(["a", "B", "c"])
    act(() => result.current.removeAt(0))
    expect(result.current.items).toEqual(["B", "c"])
    act(() => result.current.move(0, 1))
    expect(result.current.items).toEqual(["c", "B"])
    act(() => result.current.clear())
    expect(result.current.items).toEqual([])
  })

  it("treats an out-of-range move as a no-op", () => {
    const { result } = renderHook(() => useListState<number>({ defaultValue: [1, 2] }))
    act(() => result.current.move(0, 5))
    expect(result.current.items).toEqual([1, 2])
  })

  it("moves items correctly when the item is undefined", () => {
    const { result } = renderHook(() =>
      useListState<string | undefined>({ defaultValue: [undefined, "a"] }),
    )
    act(() => result.current.move(0, 1))
    expect(result.current.items).toEqual(["a", undefined])
  })
})
