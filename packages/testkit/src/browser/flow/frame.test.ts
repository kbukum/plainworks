import { describe, expect, it, vi } from "vitest"
import { type CaptureFramePage, captureOptions, withCaptureFrame } from "./frame"

function fakePage(log: string[]): CaptureFramePage {
  return {
    evaluate: vi.fn(async () => void log.push("scroll to top")),
    addStyleTag: vi.fn(async ({ content }: { content: string }) => {
      log.push(`add ${content}`)
      return { evaluate: async () => void log.push("remove") }
    }),
  }
}

describe("captureOptions", () => {
  it("frames the viewport by default, so fixed chrome sits where a user sees it", () => {
    expect(captureOptions(undefined)).toEqual({ fullPage: false })
    expect(captureOptions({ kind: "viewport" })).toEqual({ fullPage: false })
  })

  it("captures every scrolled row for a full-page capture", () => {
    expect(captureOptions({ kind: "full-page", hideFixed: ["#toaster"] })).toEqual({
      fullPage: true,
    })
  })
})

describe("withCaptureFrame", () => {
  it("frames a full page from the top with its fixed chrome hidden, then restores the chrome", async () => {
    const log: string[] = []
    const result = await withCaptureFrame(
      fakePage(log),
      { kind: "full-page", hideFixed: ["[data-devtools]", "#toaster"] },
      async () => {
        log.push("capture")
        return "shot"
      },
    )
    expect(result).toBe("shot")
    expect(log).toEqual([
      "scroll to top",
      "add [data-devtools], #toaster { visibility: hidden !important; }",
      "capture",
      "remove",
    ])
  })

  it("restores the chrome when the capture fails, so later checks see the real page", async () => {
    const log: string[] = []
    const failure = new Error("screenshot mismatch")
    await expect(
      withCaptureFrame(fakePage(log), { kind: "full-page", hideFixed: ["#toaster"] }, async () => {
        throw failure
      }),
    ).rejects.toBe(failure)
    expect(log.at(-1)).toBe("remove")
  })

  it("scrolls a full page to the top even when it has no fixed chrome to hide", async () => {
    const log: string[] = []
    const page = fakePage(log)
    await withCaptureFrame(page, { kind: "full-page", hideFixed: [] }, async () => {
      log.push("capture")
    })
    expect(log).toEqual(["scroll to top", "capture"])
    expect(page.addStyleTag).not.toHaveBeenCalled()
  })

  it("leaves a viewport capture exactly as the user sees it", async () => {
    const log: string[] = []
    const page = fakePage(log)
    for (const capture of [undefined, { kind: "viewport" } as const]) {
      await withCaptureFrame(page, capture, async () => void log.push("capture"))
    }
    expect(log).toEqual(["capture", "capture"])
    expect(page.evaluate).not.toHaveBeenCalled()
    expect(page.addStyleTag).not.toHaveBeenCalled()
  })
})
