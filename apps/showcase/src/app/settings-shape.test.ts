import { createUserSettings } from "@plainworks/demo"
import { describe, expect, it } from "vitest"
import { isUserSettings } from "./settings-shape"

describe("isUserSettings", () => {
  it("accepts a well-formed settings record", () => {
    expect(isUserSettings(createUserSettings("u1"))).toBe(true)
  })

  it("rejects a missing or wrong-typed group", () => {
    const base = createUserSettings("u1")
    expect(isUserSettings({ ...base, userId: "" })).toBe(false)
    expect(isUserSettings({ ...base, profile: { ...base.profile, displayName: 1 } })).toBe(false)
    expect(
      isUserSettings({ ...base, preferences: { ...base.preferences, itemsPerPage: 2.5 } }),
    ).toBe(false)
    expect(isUserSettings({ ...base, preferences: { ...base.preferences, itemsPerPage: 4 } })).toBe(
      false,
    )
    expect(
      isUserSettings({ ...base, preferences: { ...base.preferences, itemsPerPage: 101 } }),
    ).toBe(false)
    expect(
      isUserSettings({ ...base, notifications: { ...base.notifications, email: "yes" } }),
    ).toBe(false)
    expect(isUserSettings({ ...base, privacy: undefined })).toBe(false)
    expect(isUserSettings(null)).toBe(false)
  })

  it("rejects semantically invalid profile and regional values", () => {
    const base = createUserSettings("u1")
    expect(isUserSettings({ ...base, profile: { ...base.profile, displayName: "   " } })).toBe(
      false,
    )
    expect(isUserSettings({ ...base, profile: { ...base.profile, startDate: "2023-02-31" } })).toBe(
      false,
    )
    expect(
      isUserSettings({ ...base, preferences: { ...base.preferences, language: "unknown" } }),
    ).toBe(false)
    expect(
      isUserSettings({ ...base, preferences: { ...base.preferences, timezone: "Mars/Olympus" } }),
    ).toBe(false)
  })
})
