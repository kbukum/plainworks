import { describe, expect, it } from "vitest"
import { judgeOverlayContainment } from "./layout"

const VIEWPORT = { width: 844, height: 390 }

describe("judgeOverlayContainment", () => {
  it("accepts an overlay that sits inside the viewport", () => {
    expect(
      judgeOverlayContainment(
        [{ name: "New task", top: 16, bottom: 374, left: 200, right: 644 }],
        VIEWPORT,
      ),
    ).toEqual([])
  })

  it("reports each edge an overlay crosses", () => {
    expect(
      judgeOverlayContainment(
        [{ name: "New task", top: -90, bottom: 480, left: 200, right: 644 }],
        VIEWPORT,
      ),
    ).toEqual(["New task: extends 90px above and 90px below the 844x390 viewport"])
  })

  it("reports horizontal clipping too", () => {
    expect(
      judgeOverlayContainment(
        [{ name: "Menu", top: 10, bottom: 100, left: -4, right: 900 }],
        VIEWPORT,
      ),
    ).toEqual(["Menu: extends 4px left of and 56px right of the 844x390 viewport"])
  })

  it("tolerates one pixel of sub-pixel rounding", () => {
    expect(
      judgeOverlayContainment(
        [{ name: "Dialog", top: -0.5, bottom: 390.8, left: 0, right: 844 }],
        VIEWPORT,
      ),
    ).toEqual([])
  })
})
