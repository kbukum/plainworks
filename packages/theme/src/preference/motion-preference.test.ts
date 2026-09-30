import { describe, expect, it } from "vitest"
import { isMotionPreference, MOTION_PREFERENCES, motionPreferenceOf } from "./motion-preference"

describe("motion preference", () => {
  it("lists system first, as the default", () => {
    expect(MOTION_PREFERENCES).toEqual(["system", "reduce"])
  })

  it("accepts only a known choice", () => {
    expect(isMotionPreference("reduce")).toBe(true)
    expect(isMotionPreference("full")).toBe(false)
    expect(isMotionPreference(undefined)).toBe(false)
  })

  it("coerces an untrusted value, falling back to system", () => {
    expect(motionPreferenceOf("reduce")).toBe("reduce")
    expect(motionPreferenceOf(42)).toBe("system")
    expect(motionPreferenceOf("nope", "reduce")).toBe("reduce")
  })
})
