// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ClipboardError, useClipboard } from "./use-clipboard"

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  })
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe("useClipboard", () => {
  it("sets copied on success and auto-resets after the delay", async () => {
    stubClipboard(() => Promise.resolve())
    const { result } = renderHook(() => useClipboard({ resetAfterMs: 1000 }))

    await act(async () => {
      await result.current.copy("token")
    })
    expect(result.current.copied).toBe(true)
    expect(result.current.error).toBeUndefined()

    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.copied).toBe(false)
  })

  it("surfaces a typed error instead of swallowing a rejected write", async () => {
    const rawError = new Error("not focused")
    stubClipboard(() => Promise.reject(rawError))
    const { result } = renderHook(() => useClipboard())

    await act(async () => {
      await expect(result.current.copy("token")).rejects.toThrow("not focused")
    })
    expect(result.current.copied).toBe(false)
    expect(result.current.error).toBeInstanceOf(ClipboardError)
    expect(result.current.error?.kind).toBe("clipboard/failed")
    expect(result.current.error?.cause).toBe(rawError)
  })

  it("classifies permission denial into clipboard/denied", async () => {
    const deniedError = new DOMException("Permission denied", "NotAllowedError")
    stubClipboard(() => Promise.reject(deniedError))
    const { result } = renderHook(() => useClipboard())

    await act(async () => {
      await expect(result.current.copy("token")).rejects.toThrow("Permission denied")
    })
    expect(result.current.error?.kind).toBe("clipboard/denied")
    expect(result.current.error?.cause).toBe(deniedError)
  })

  it("reports clipboard/unavailable when navigator.clipboard is missing", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    })
    const { result } = renderHook(() => useClipboard())

    await act(async () => {
      await expect(result.current.copy("token")).rejects.toThrow(
        "Clipboard API is unavailable in this context",
      )
    })
    expect(result.current.error?.kind).toBe("clipboard/unavailable")
  })

  it("clears the pending reset timer on unmount", async () => {
    stubClipboard(() => Promise.resolve())
    const { result, unmount } = renderHook(() => useClipboard())
    await act(async () => {
      await result.current.copy("token")
    })
    unmount()
    // No act warning / state update after unmount when the timer fires.
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow()
  })

  it("ignores a writeText that resolves after unmount", async () => {
    let resolveWrite: () => void = () => {}
    stubClipboard(() => new Promise<void>((resolve) => (resolveWrite = resolve)))
    const { result, unmount } = renderHook(() => useClipboard())
    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.copy("token")
    })
    unmount()
    await act(async () => {
      resolveWrite()
      await pending
    })
    // The late resolve neither updates unmounted state nor leaves an orphan timer to fire.
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow()
  })

  it("rejects without updating unmounted state when writeText rejects after unmount", async () => {
    let rejectWrite: (reason: unknown) => void = () => {}
    stubClipboard(() => new Promise<void>((_, reject) => (rejectWrite = reject)))
    const { result, unmount } = renderHook(() => useClipboard())
    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.copy("token")
    })
    unmount()
    await act(async () => {
      rejectWrite(new Error("aborted"))
      await expect(pending).rejects.toThrow("aborted")
    })
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow()
  })

  it("ignores a writeText that resolves after reset()", async () => {
    let resolveWrite: () => void = () => {}
    stubClipboard(() => new Promise<void>((resolve) => (resolveWrite = resolve)))
    const { result } = renderHook(() => useClipboard())
    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.copy("token")
    })
    act(() => {
      result.current.reset()
    })
    await act(async () => {
      resolveWrite()
      await pending
    })
    expect(result.current.copied).toBe(false)
  })
})
