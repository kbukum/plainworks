import { describe, expect, it } from "vitest"
import { DEVICE_IDS, DEVICE_PROFILES, deviceContextOptions } from "./devices"

describe("DEVICE_PROFILES", () => {
  it("defines one profile per device id, each keyed by its own id", () => {
    for (const id of DEVICE_IDS) expect(DEVICE_PROFILES[id].id).toBe(id)
  })

  it("makes phones and tablets touch devices, and keeps desktop and reflow on a mouse", () => {
    expect(DEVICE_PROFILES.mobile).toMatchObject({ isMobile: true, hasTouch: true })
    expect(DEVICE_PROFILES.tablet).toMatchObject({ hasTouch: true, viewport: { width: 768 } })
    expect(DEVICE_PROFILES.desktop).toMatchObject({ isMobile: false, hasTouch: false })
    expect(DEVICE_PROFILES.reflow).toMatchObject({
      hasTouch: false,
      viewport: { width: 320, height: 640 },
    })
  })

  it("turns the landscape phone sideways, the shortest common screen", () => {
    const { width, height } = DEVICE_PROFILES.landscape.viewport
    expect(height).toBeLessThan(width)
  })

  it("maps a profile to context options only, never a borrowed user agent or browser", () => {
    const options = deviceContextOptions(DEVICE_PROFILES.mobile)
    expect(Object.keys(options).sort()).toEqual([
      "deviceScaleFactor",
      "hasTouch",
      "isMobile",
      "viewport",
    ])
  })
})
