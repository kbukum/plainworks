// @vitest-environment jsdom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { MotionPreference } from "../preference"
import { useDocumentMotion } from "./document-motion"

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.motion
})

describe("useDocumentMotion", () => {
  it("writes the choice to the document root and follows changes", () => {
    const { rerender } = renderHook(({ motion }) => useDocumentMotion(motion), {
      initialProps: { motion: "reduce" as MotionPreference },
    })
    expect(document.documentElement.dataset.motion).toBe("reduce")

    rerender({ motion: "system" })
    expect(document.documentElement.dataset.motion).toBe("system")
  })

  it("restores what the root held before it mounted", () => {
    document.documentElement.dataset.motion = "system"
    const { unmount } = renderHook(() => useDocumentMotion("reduce"))
    expect(document.documentElement.dataset.motion).toBe("reduce")

    unmount()
    expect(document.documentElement.dataset.motion).toBe("system")
  })

  it("removes the attribute on unmount when the root had none", () => {
    const { unmount } = renderHook(() => useDocumentMotion("reduce"))
    unmount()
    expect(document.documentElement.dataset.motion).toBeUndefined()
  })
})
