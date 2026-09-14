// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useDisclosure } from "./use-disclosure"

afterEach(cleanup)

describe("useDisclosure", () => {
  it("defaults closed and opens, closes, and toggles", () => {
    const { result } = renderHook(() => useDisclosure())

    expect(result.current.open).toBe(false)
    act(() => result.current.onOpen())
    expect(result.current.open).toBe(true)
    act(() => result.current.onClose())
    expect(result.current.open).toBe(false)
    act(() => result.current.toggle())
    expect(result.current.open).toBe(true)
  })

  it("respects a defaultOpen seed", () => {
    const { result } = renderHook(() => useDisclosure({ defaultOpen: true }))
    expect(result.current.open).toBe(true)
  })

  it("stays controlled by the open prop and only reports intent", () => {
    const onOpenChange = vi.fn()
    const { result, rerender } = renderHook(({ open }) => useDisclosure({ open, onOpenChange }), {
      initialProps: { open: false },
    })

    act(() => result.current.onOpen())
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    expect(result.current.open).toBe(false)
    rerender({ open: true })
    expect(result.current.open).toBe(true)
  })
})
