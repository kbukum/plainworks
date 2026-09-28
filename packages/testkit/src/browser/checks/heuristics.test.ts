import { describe, expect, it } from "vitest"
import {
  judgeBrokenImages,
  judgeClippedText,
  judgeLayout,
  judgeLayoutShift,
  judgeObscuredFocusables,
  judgeOverlappingTargets,
  type LayoutFacts,
  type TextFact,
  type TrackedBox,
} from "./heuristics"

const box = (x: number, y: number, width = 100, height = 40) => ({ x, y, width, height })

const text = (overrides: Partial<TextFact> = {}): TextFact => ({
  name: "Quarterly revenue",
  clientWidth: 120,
  scrollWidth: 120,
  clientHeight: 20,
  scrollHeight: 20,
  clipsX: true,
  clipsY: true,
  ellipsis: false,
  lineClamp: false,
  ...overrides,
})

describe("judgeClippedText", () => {
  it("passes text that fits its box", () => {
    expect(judgeClippedText([text()])).toEqual([])
  })

  it("reports text cut off by a box that hides its overflow", () => {
    expect(judgeClippedText([text({ scrollWidth: 180 })])).toEqual([
      {
        check: "clipped-text",
        message: '"Quarterly revenue" is cut off: 60px wider than its 120px box',
      },
    ])
    expect(judgeClippedText([text({ scrollHeight: 44 })])[0]?.message).toBe(
      '"Quarterly revenue" is cut off: 24px taller than its 20px box',
    )
  })

  it("accepts deliberate truncation and overflow that can scroll into view", () => {
    expect(
      judgeClippedText([
        text({ scrollWidth: 180, ellipsis: true }),
        text({ scrollHeight: 60, lineClamp: true }),
        text({ scrollWidth: 180, clipsX: false }),
      ]),
    ).toEqual([])
  })

  it("tolerates sub-pixel and glyph-overhang rounding", () => {
    expect(judgeClippedText([text({ scrollWidth: 122, scrollHeight: 22 })])).toEqual([])
  })
})

describe("judgeOverlappingTargets", () => {
  it("passes targets that sit apart or only touch", () => {
    expect(
      judgeOverlappingTargets([
        { key: "0.1", name: "Save", box: box(0, 0), exposed: true },
        { key: "0.2", name: "Cancel", box: box(100, 0), exposed: true },
      ]),
    ).toEqual([])
  })

  it("reports two visible controls drawn over each other", () => {
    expect(
      judgeOverlappingTargets([
        { key: "0.1", name: "Save", box: box(0, 0), exposed: true },
        { key: "0.2", name: "Cancel", box: box(70, 10), exposed: true },
      ]),
    ).toEqual([{ check: "overlapping-targets", message: '"Save" and "Cancel" overlap by 30x30px' }])
  })

  it("ignores a control nested in another and one hidden under an overlay", () => {
    expect(
      judgeOverlappingTargets([
        { key: "0.1", name: "Row", box: box(0, 0, 400), exposed: true },
        { key: "0.1.4", name: "Edit", box: box(300, 0), exposed: true },
        { key: "0.2", name: "Behind dialog", box: box(0, 0), exposed: false },
      ]),
    ).toEqual([])
  })
})

describe("judgeObscuredFocusables", () => {
  it("reports focusable content hidden under fixed chrome", () => {
    expect(
      judgeObscuredFocusables([
        { name: "Load more", coveredBy: { name: "Devtools bar", overlay: false } },
      ]),
    ).toEqual([
      {
        check: "obscured-focusable",
        message: '"Load more" is covered by fixed chrome "Devtools bar"',
      },
    ])
  })

  it("accepts an uncovered control and one an open overlay covers on purpose", () => {
    expect(
      judgeObscuredFocusables([
        { name: "Save", coveredBy: null },
        { name: "Tasks", coveredBy: { name: "New task", overlay: true } },
      ]),
    ).toEqual([])
  })
})

describe("judgeBrokenImages", () => {
  it("reports an image that failed to decode and a visible one still loading", () => {
    expect(
      judgeBrokenImages([
        { name: "avatar.png", complete: true, naturalWidth: 0, inViewport: true },
        { name: "hero.jpg", complete: false, naturalWidth: 0, inViewport: true },
      ]),
    ).toEqual([
      { check: "broken-image", message: '"avatar.png" failed to load' },
      { check: "broken-image", message: '"hero.jpg" is still loading at capture' },
    ])
  })

  it("accepts loaded images and lazy ones below the fold", () => {
    expect(
      judgeBrokenImages([
        { name: "logo.svg", complete: true, naturalWidth: 32, inViewport: true },
        { name: "footer.jpg", complete: false, naturalWidth: 0, inViewport: false },
      ]),
    ).toEqual([])
  })
})

describe("judgeLayoutShift", () => {
  const tracked = (key: string, x: number, y: number): TrackedBox => ({
    key,
    name: key,
    box: box(x, y),
  })

  it("passes a layout that held still between readiness and capture", () => {
    expect(
      judgeLayoutShift([tracked("save", 0, 0)], [tracked("save", 0.4, 0), tracked("new", 5, 5)]),
    ).toEqual([])
  })

  it("reports each element that moved or resized after the checkpoint was ready", () => {
    expect(judgeLayoutShift([tracked("save", 0, 0)], [tracked("save", 0, 48)])).toEqual([
      { check: "layout-shift", message: '"save" moved 0,48px after the checkpoint was ready' },
    ])
  })
})

describe("judgeLayout", () => {
  it("runs every single-frame heuristic over one measurement", () => {
    const facts: LayoutFacts = {
      texts: [text({ name: "cell", scrollWidth: 200 })],
      targets: [],
      focusables: [],
      images: [{ name: "logo", complete: true, naturalWidth: 0, inViewport: true }],
      tracked: [],
    }
    expect(judgeLayout(facts).map((finding) => finding.check)).toEqual([
      "clipped-text",
      "broken-image",
    ])
  })
})
