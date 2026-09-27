import { describe, expect, it } from "vitest"
import {
  type DevtoolsLayout,
  type DockViewport,
  isDevtoolsLayout,
  keyboardPanelSize,
  pointerPanelSize,
  resolveDock,
  withPanelSize,
} from "./layout"

const desktop: DockViewport = { width: 1280, height: 800, barSize: 44, sideDockFits: true }
const phone: DockViewport = { width: 320, height: 568, barSize: 44, sideDockFits: false }

describe("resolveDock", () => {
  it("docks on the chosen side when the viewport fits a side dock", () => {
    expect(resolveDock({ side: "left" }, desktop)).toMatchObject({ side: "left", axis: "inline" })
    expect(resolveDock({ side: "right" }, desktop)).toMatchObject({ side: "right", axis: "inline" })
    expect(resolveDock({ side: "bottom" }, desktop)).toMatchObject({
      side: "bottom",
      axis: "block",
    })
  })

  it("falls back to the bottom when the viewport is too narrow for a side dock", () => {
    expect(resolveDock({ side: "right" }, phone)).toMatchObject({ side: "bottom", axis: "block" })
    expect(resolveDock({ side: "left" }, phone)).toMatchObject({ side: "bottom", axis: "block" })
  })

  it("sizes a panel fluidly from the viewport until the user picks a size", () => {
    expect(resolveDock({ side: "right" }, desktop).size).toBe(461)
    expect(resolveDock({ side: "right" }, { ...desktop, width: 2560 }).size).toBe(704)
    expect(resolveDock({ side: "right" }, { ...desktop, width: 768 }).size).toBe(320)
    expect(resolveDock({ side: "bottom" }, desktop).size).toBe(440)
    expect(resolveDock({ side: "bottom" }, { ...desktop, height: 1440 }).size).toBe(576)
  })

  it("keeps a chosen size inside bounds that leave the host a usable area", () => {
    // The host keeps its reserve beside both the bar and the panel: 1280 - 44 - 360.
    const wide = resolveDock({ side: "right", inlineSize: 5_000 }, desktop)
    expect(wide).toMatchObject({ size: 876, min: 320, max: 876 })
    expect(resolveDock({ side: "left", inlineSize: 10 }, desktop).size).toBe(320)
    const tall = resolveDock({ side: "bottom", blockSize: 5_000 }, desktop)
    expect(tall).toMatchObject({ size: 516, min: 192, max: 516 })
  })

  it("keeps the panel usable on a tiny viewport rather than inverting its bounds", () => {
    const dock = resolveDock({ side: "bottom", blockSize: 400 }, { ...phone, height: 320 })
    expect(dock).toMatchObject({ min: 192, max: 192, size: 192 })
  })

  it("fits the panel beside the bar when the viewport is too short for its usual minimum", () => {
    // 200px tall, less the 44px bar, leaves 156px: the panel takes all of it and no more.
    const short = resolveDock({ side: "bottom", blockSize: 400 }, { ...phone, height: 200 })
    expect(short).toMatchObject({ min: 156, max: 156, size: 156 })
    const narrow = resolveDock({ side: "right" }, { ...desktop, width: 300 })
    expect(narrow).toMatchObject({ min: 256, max: 256, size: 256 })
  })

  it("counts the bar at the user's font size", () => {
    const large = resolveDock({ side: "bottom" }, { ...phone, height: 200, barSize: 88 })
    expect(large).toMatchObject({ min: 112, max: 112, size: 112 })
  })

  it("remembers each axis separately", () => {
    const layout: DevtoolsLayout = { side: "bottom", inlineSize: 500, blockSize: 300 }
    expect(resolveDock(layout, desktop).size).toBe(300)
    expect(resolveDock({ ...layout, side: "right" }, desktop).size).toBe(500)
  })
})

describe("withPanelSize", () => {
  it("stores the clamped size on the axis the panel resizes along", () => {
    const layout: DevtoolsLayout = { side: "right", blockSize: 300 }
    const dock = resolveDock(layout, desktop)
    expect(withPanelSize(layout, dock, 600)).toEqual({
      side: "right",
      inlineSize: 600,
      blockSize: 300,
    })
    expect(withPanelSize(layout, dock, 99_999)).toMatchObject({ inlineSize: 876 })
  })

  it("stores a narrow-viewport fallback's size as the block size", () => {
    const layout: DevtoolsLayout = { side: "right", inlineSize: 500 }
    expect(withPanelSize(layout, resolveDock(layout, phone), 250)).toEqual({
      side: "right",
      inlineSize: 500,
      blockSize: 250,
    })
  })
})

describe("keyboardPanelSize", () => {
  const right = resolveDock({ side: "right", inlineSize: 500 }, desktop)
  const left = resolveDock({ side: "left", inlineSize: 500 }, desktop)
  const bottom = resolveDock({ side: "bottom", blockSize: 300 }, desktop)

  it("grows the panel with the arrow pointing into the host", () => {
    expect(keyboardPanelSize(right, "ArrowLeft", false)).toBe(516)
    expect(keyboardPanelSize(right, "ArrowRight", false)).toBe(484)
    expect(keyboardPanelSize(left, "ArrowRight", false)).toBe(516)
    expect(keyboardPanelSize(left, "ArrowLeft", false)).toBe(484)
    expect(keyboardPanelSize(bottom, "ArrowUp", false)).toBe(316)
    expect(keyboardPanelSize(bottom, "ArrowDown", false)).toBe(284)
  })

  it("takes larger steps with Shift", () => {
    expect(keyboardPanelSize(right, "ArrowLeft", true)).toBe(564)
    expect(keyboardPanelSize(bottom, "ArrowDown", true)).toBe(236)
  })

  it("jumps to the bounds with Home and End", () => {
    expect(keyboardPanelSize(right, "Home", false)).toBe(320)
    expect(keyboardPanelSize(right, "End", false)).toBe(876)
    expect(keyboardPanelSize(bottom, "End", false)).toBe(516)
  })

  it("stays inside the bounds", () => {
    const smallest = resolveDock({ side: "bottom", blockSize: 192 }, desktop)
    expect(keyboardPanelSize(smallest, "ArrowDown", true)).toBe(192)
  })

  it("ignores keys that do not move this splitter", () => {
    expect(keyboardPanelSize(right, "ArrowUp", false)).toBeUndefined()
    expect(keyboardPanelSize(bottom, "ArrowLeft", false)).toBeUndefined()
    expect(keyboardPanelSize(bottom, "Enter", false)).toBeUndefined()
  })
})

describe("pointerPanelSize", () => {
  it("grows the panel as the pointer moves into the host", () => {
    const right = resolveDock({ side: "right", inlineSize: 500 }, desktop)
    expect(pointerPanelSize(right, 500, { x: -40, y: 12 })).toBe(540)
    const left = resolveDock({ side: "left", inlineSize: 500 }, desktop)
    expect(pointerPanelSize(left, 500, { x: -40, y: 0 })).toBe(460)
    const bottom = resolveDock({ side: "bottom", blockSize: 300 }, desktop)
    expect(pointerPanelSize(bottom, 300, { x: 90, y: -50 })).toBe(350)
  })

  it("clamps a drag past either bound", () => {
    const bottom = resolveDock({ side: "bottom", blockSize: 300 }, desktop)
    expect(pointerPanelSize(bottom, 300, { x: 0, y: 1_000 })).toBe(192)
    expect(pointerPanelSize(bottom, 300, { x: 0, y: -1_000 })).toBe(516)
  })
})

describe("isDevtoolsLayout", () => {
  it("accepts a stored layout", () => {
    expect(isDevtoolsLayout({ side: "left" })).toBe(true)
    expect(isDevtoolsLayout({ side: "bottom", inlineSize: 400, blockSize: 250 })).toBe(true)
  })

  it("rejects a tampered or foreign value", () => {
    for (const value of [
      null,
      "right",
      [],
      {},
      { side: "top" },
      { side: "right", inlineSize: "400" },
      { side: "right", inlineSize: Number.NaN },
      { side: "right", blockSize: Number.POSITIVE_INFINITY },
      { side: "bottom", blockSize: -1 },
    ]) {
      expect(isDevtoolsLayout(value), JSON.stringify(value)).toBe(false)
    }
  })
})
