import { describe, expect, it } from "vitest"
import { COMPACT_MATRIX, DIALOG_MATRIX, expandMatrix, FULL_MATRIX, GATE_VIEWPORTS } from "./matrix"

describe("expandMatrix", () => {
  it("crosses every mode with every viewport in declaration order", () => {
    const variants = expandMatrix(COMPACT_MATRIX)
    expect(variants.map((variant) => variant.id)).toEqual([
      "light-desktop",
      "light-mobile",
      "dark-desktop",
      "dark-mobile",
    ])
    expect(variants[1]).toMatchObject({
      mode: "light",
      viewport: "mobile",
      size: GATE_VIEWPORTS.mobile,
    })
  })

  it("covers desktop, tablet, mobile, and 320 px reflow in both modes for the full matrix", () => {
    const ids = expandMatrix(FULL_MATRIX).map((variant) => variant.id)
    expect(ids).toHaveLength(8)
    expect(ids).toContain("dark-reflow")
    expect(GATE_VIEWPORTS.reflow.width).toBe(320)
  })

  it("adds a short landscape screen for dialogs, where a tall dialog runs out of height", () => {
    const ids = expandMatrix(DIALOG_MATRIX).map((variant) => variant.id)
    expect(ids).toEqual([
      "light-desktop",
      "light-mobile",
      "light-landscape",
      "dark-desktop",
      "dark-mobile",
      "dark-landscape",
    ])
    expect(GATE_VIEWPORTS.landscape.height).toBeLessThan(GATE_VIEWPORTS.landscape.width)
  })

  it("drops duplicate axes so a surface never captures one variant twice", () => {
    const ids = expandMatrix({ modes: ["dark", "dark"], viewports: ["mobile", "mobile"] }).map(
      (variant) => variant.id,
    )
    expect(ids).toEqual(["dark-mobile"])
  })

  it("rejects an empty axis, which would silently declare no coverage", () => {
    expect(() => expandMatrix({ modes: [], viewports: ["desktop"] })).toThrow(RangeError)
    expect(() => expandMatrix({ modes: ["light"], viewports: [] })).toThrow(RangeError)
  })
})
