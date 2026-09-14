// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useControllableState } from "./use-controllable-state"

afterEach(cleanup)

describe("useControllableState", () => {
  it("owns the value when uncontrolled and reports every change", () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useControllableState({ defaultValue: 0, onChange }))

    expect(result.current[0]).toBe(0)
    act(() => result.current[1](5))
    expect(result.current[0]).toBe(5)
    expect(onChange).toHaveBeenLastCalledWith(5)
  })

  it("resolves an updater function against the current value", () => {
    const { result } = renderHook(() => useControllableState({ defaultValue: 1 }))
    act(() => result.current[1]((previous) => previous + 10))
    expect(result.current[0]).toBe(11)
  })

  it("composes functional updaters batched within one event", () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useControllableState({ defaultValue: 0, onChange }))
    act(() => {
      result.current[1]((previous) => previous + 1)
      result.current[1]((previous) => previous + 1)
    })
    expect(result.current[0]).toBe(2)
    expect(onChange).toHaveBeenNthCalledWith(1, 1)
    expect(onChange).toHaveBeenNthCalledWith(2, 2)
  })

  it("never mutates internal state when controlled — the value prop wins", () => {
    const onChange = vi.fn()
    const { result, rerender } = renderHook(
      ({ value }) => useControllableState({ value, defaultValue: 0, onChange }),
      { initialProps: { value: 2 } },
    )

    expect(result.current[0]).toBe(2)
    act(() => result.current[1](9))
    // Controlled: onChange fires but the rendered value stays pinned to the prop until it changes.
    expect(onChange).toHaveBeenLastCalledWith(9)
    expect(result.current[0]).toBe(2)
    rerender({ value: 3 })
    expect(result.current[0]).toBe(3)
  })

  it("derives controlled functional updates from the prop even if parent rejects previous update", () => {
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useControllableState({ value: false, defaultValue: false, onChange }),
    )

    expect(result.current[0]).toBe(false)
    act(() => result.current[1](true))
    expect(onChange).toHaveBeenLastCalledWith(true)

    // Parent declined to update `value`, so it remains false. A subsequent functional update
    // must derive from current prop (`false`), not the uncommitted `true`.
    act(() => result.current[1]((prev) => !prev))
    expect(onChange).toHaveBeenLastCalledWith(true)
    expect(result.current[0]).toBe(false)
  })
})
