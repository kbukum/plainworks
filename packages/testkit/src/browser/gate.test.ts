import { describe, expect, it } from "vitest"
import { browserGateScreenshot } from "./gate"

// WCAG 2.5.8: the smallest control the kit draws is 24×24 CSS px.
const MIN_TARGET_PIXELS = 24 * 24

describe("browserGateScreenshot", () => {
  it("fails a capture that loses even the smallest control, whatever its size", () => {
    expect(browserGateScreenshot).not.toHaveProperty("maxDiffPixelRatio")
    expect(browserGateScreenshot.maxDiffPixels).toBeLessThan(MIN_TARGET_PIXELS)
  })
})
