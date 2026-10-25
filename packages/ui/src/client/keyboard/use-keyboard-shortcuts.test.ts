// @vitest-environment jsdom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { isSingleKey, useKeyboardShortcuts } from "./use-keyboard-shortcuts"

afterEach(cleanup)

function press(init: KeyboardEventInit): void {
  window.dispatchEvent(new KeyboardEvent("keydown", init))
}

function editable(attribute: string, value: string): HTMLElement {
  const element = document.createElement("div")
  element.setAttribute(attribute, value)
  return element
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
    press({ key: "K", shiftKey: true })
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

  it("ignores character keys typed into a field, but keeps modified combos there", () => {
    const sheet = vi.fn()
    const palette = vi.fn()
    renderHook(() => useKeyboardShortcuts({ "shift+?": sheet, "mod+k": palette }))
    for (const field of [
      document.createElement("input"),
      document.createElement("textarea"),
      document.createElement("select"),
      editable("contenteditable", "true"),
      editable("role", "combobox"),
    ]) {
      document.body.append(field)
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "?", shiftKey: true, bubbles: true }))
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))
      field.remove()
    }
    expect(sheet).not.toHaveBeenCalled()
    expect(palette).toHaveBeenCalledTimes(5)
  })

  it("fires character keys outside fields", () => {
    const sheet = vi.fn()
    renderHook(() => useKeyboardShortcuts({ "shift+?": sheet }))
    const button = document.createElement("button")
    document.body.append(button)
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "?", shiftKey: true, bubbles: true }))
    button.remove()
    expect(sheet).toHaveBeenCalledTimes(1)
  })

  it("turns character keys off without touching modified combos or named keys", () => {
    const toggle = vi.fn()
    const palette = vi.fn()
    const dismiss = vi.fn()
    renderHook(() =>
      useKeyboardShortcuts(
        { "[": toggle, "mod+k": palette, Escape: dismiss },
        { singleKeys: false },
      ),
    )
    press({ key: "[" })
    press({ key: "k", ctrlKey: true })
    press({ key: "Escape" })
    expect(toggle).not.toHaveBeenCalled()
    expect(palette).toHaveBeenCalledTimes(1)
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it("skips events another handler already took and keys held down", () => {
    const toggle = vi.fn()
    renderHook(() => useKeyboardShortcuts({ "[": toggle }))
    const taken = new KeyboardEvent("keydown", { key: "[", cancelable: true })
    taken.preventDefault()
    window.dispatchEvent(taken)
    press({ key: "[", repeat: true })
    press({ key: "[", isComposing: true })
    expect(toggle).not.toHaveBeenCalled()
  })
})

describe("character keys on real layouts", () => {
  it("matches the typed character, whatever Shift or AltGr produced it", () => {
    const sheet = vi.fn()
    const toggle = vi.fn()
    renderHook(() => useKeyboardShortcuts({ "?": sheet, "[": toggle }))
    press({ key: "?", shiftKey: true })
    press({ key: "[", ctrlKey: true, altKey: true })
    press({ key: "[" })
    press({ key: "[", ctrlKey: true })
    press({ key: "[", metaKey: true })
    expect(sheet).toHaveBeenCalledTimes(1)
    expect(toggle).toHaveBeenCalledTimes(2)
  })

  it("matches punctuation typed with Option on macOS, but not Alt with a letter or digit", () => {
    const toggle = vi.fn()
    const search = vi.fn()
    const first = vi.fn()
    renderHook(() => useKeyboardShortcuts({ "[": toggle, "/": search, "1": first }))
    press({ key: "[", altKey: true })
    press({ key: "/", altKey: true, shiftKey: true })
    press({ key: "1", altKey: true })
    expect(toggle).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
    const letter = vi.fn()
    renderHook(() => useKeyboardShortcuts({ k: letter }))
    press({ key: "k", altKey: true })
    expect(letter).not.toHaveBeenCalled()
  })
})

describe("isSingleKey", () => {
  it("names character combos without a command modifier", () => {
    expect(isSingleKey("k")).toBe(true)
    expect(isSingleKey("shift+?")).toBe(true)
    expect(isSingleKey("?")).toBe(true)
    expect(isSingleKey("mod+k")).toBe(false)
    expect(isSingleKey("alt+k")).toBe(false)
    expect(isSingleKey("Escape")).toBe(false)
  })
})
