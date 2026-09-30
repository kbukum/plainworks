// @vitest-environment jsdom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts"

afterEach(cleanup)

function press(init: KeyboardEventInit): void {
  window.dispatchEvent(new KeyboardEvent("keydown", init))
}

describe("useKeyboardShortcuts", () => {
  it("invokes the handler when its combo is pressed and ignores others", () => {
    const onSave = vi.fn()
    renderHook(() => useKeyboardShortcuts({ "mod+s": onSave }))

    press({ key: "s", metaKey: true })
    press({ key: "s", ctrlKey: true })
    press({ key: "s" })
    expect(onSave).toHaveBeenCalledTimes(2)
  })

  it("distinguishes modifier combinations", () => {
    const plain = vi.fn()
    const shifted = vi.fn()
    renderHook(() => useKeyboardShortcuts({ k: plain, "shift+k": shifted }))

    press({ key: "k" })
    press({ key: "k", shiftKey: true })
    expect(plain).toHaveBeenCalledTimes(1)
    expect(shifted).toHaveBeenCalledTimes(1)
  })

  it("does not bind when disabled and detaches on unmount", () => {
    const handler = vi.fn()
    const { unmount, rerender } = renderHook(
      ({ enabled }) => useKeyboardShortcuts({ x: handler }, { enabled }),
      { initialProps: { enabled: false } },
    )
    press({ key: "x" })
    expect(handler).not.toHaveBeenCalled()

    rerender({ enabled: true })
    press({ key: "x" })
    expect(handler).toHaveBeenCalledTimes(1)

    unmount()
    press({ key: "x" })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("updates handlers on rerender without dropping bindings", () => {
    const firstHandler = vi.fn()
    const secondHandler = vi.fn()
    const { rerender } = renderHook(({ handler }) => useKeyboardShortcuts({ Enter: handler }), {
      initialProps: { handler: firstHandler },
    })

    press({ key: "Enter" })
    expect(firstHandler).toHaveBeenCalledTimes(1)
    expect(secondHandler).not.toHaveBeenCalled()

    rerender({ handler: secondHandler })
    press({ key: "Enter" })
    expect(firstHandler).toHaveBeenCalledTimes(1)
    expect(secondHandler).toHaveBeenCalledTimes(1)
  })
})
