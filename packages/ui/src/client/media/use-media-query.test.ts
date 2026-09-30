// @vitest-environment jsdom

import { installMatchMedia } from "@plainworks/testkit/client"
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { useMediaQuery } from "./use-media-query"

afterEach(cleanup)

describe("useMediaQuery", () => {
  it("reports the initial match and reacts to preference changes", () => {
    const media = installMatchMedia(true)
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"))

    expect(result.current).toBe(true)
    act(() => media.setMatches(false))
    expect(result.current).toBe(false)
  })

  it("defaults to false (mobile-first) when matchMedia is unavailable", () => {
    // No fake installed: jsdom ships no matchMedia, so the hook must degrade to the SSR default.
    const original = window.matchMedia
    delete (window as { matchMedia?: unknown }).matchMedia
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"))
    expect(result.current).toBe(false)
    if (original !== undefined) window.matchMedia = original
  })
})
