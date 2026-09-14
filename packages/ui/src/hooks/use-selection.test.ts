// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useSelection } from "./use-selection"

afterEach(cleanup)

describe("useSelection", () => {
  it("accumulates keys in multiple mode and toggles them off", () => {
    const { result } = renderHook(() => useSelection<string>())

    act(() => result.current.toggle("a"))
    act(() => result.current.toggle("b"))
    expect([...result.current.selected]).toEqual(["a", "b"])
    expect(result.current.isSelected("a")).toBe(true)
    act(() => result.current.toggle("a"))
    expect([...result.current.selected]).toEqual(["b"])
  })

  it("accumulates keys selected in a single batched event", () => {
    const { result } = renderHook(() => useSelection<string>())
    act(() => {
      result.current.select("a")
      result.current.select("b")
    })
    expect([...result.current.selected]).toEqual(["a", "b"])
  })

  it("keeps at most one key in single mode", () => {
    const { result } = renderHook(() => useSelection<string>({ mode: "single" }))

    act(() => result.current.select("a"))
    act(() => result.current.select("b"))
    expect([...result.current.selected]).toEqual(["b"])
    act(() => result.current.toggle("b"))
    expect([...result.current.selected]).toEqual([])
  })

  it("deselects, clears, and reports the controlled set through onChange", () => {
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useSelection<string>({ defaultValue: new Set(["a", "b"]), onChange }),
    )

    act(() => result.current.deselect("a"))
    expect(onChange).toHaveBeenLastCalledWith(new Set(["b"]))
    act(() => result.current.clear())
    expect(result.current.selected.size).toBe(0)
  })
})
