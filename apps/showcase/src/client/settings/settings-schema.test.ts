import { validateWithSchema } from "@plainworks/std"
import { describe, expect, it } from "vitest"
import {
  notificationsFormSchema,
  preferencesFormSchema,
  profileFormSchema,
} from "./settings-schema"

describe("profileFormSchema", () => {
  it("requires a display name", async () => {
    const result = await validateWithSchema(profileFormSchema(), { displayName: "  " })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected failure")
    expect(result.error[0]?.path?.[0]).toBe("displayName")
  })

  it("rejects a malformed start date", async () => {
    const result = await validateWithSchema(profileFormSchema(), {
      displayName: "Ada",
      startDate: "06/01/2023",
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected failure")
    expect(result.error[0]?.path?.[0]).toBe("startDate")
  })

  it("rejects an impossible ISO calendar date", async () => {
    const result = await validateWithSchema(profileFormSchema(), {
      displayName: "Ada",
      startDate: "2023-02-31",
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected failure")
    expect(result.error[0]?.path?.[0]).toBe("startDate")
  })

  it("trims fields and yields a profile group", async () => {
    const result = await validateWithSchema(profileFormSchema(), {
      displayName: " Ada ",
      jobTitle: " Engineer ",
      bio: " builds things ",
      startDate: "2023-06-01",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected success")
    expect(result.value).toEqual({
      profile: {
        displayName: "Ada",
        jobTitle: "Engineer",
        bio: "builds things",
        startDate: "2023-06-01",
      },
    })
  })
})

describe("preferencesFormSchema", () => {
  it("rejects an unknown language and an out-of-range page size", async () => {
    const result = await validateWithSchema(preferencesFormSchema(), {
      language: "xx",
      timezone: "America/New_York",
      itemsPerPage: "4",
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected failure")
    const paths = result.error.map((issue) => issue.path?.[0])
    expect(paths).toContain("language")
    expect(paths).toContain("itemsPerPage")
  })

  it("coerces the page size to a number", async () => {
    const result = await validateWithSchema(preferencesFormSchema(), {
      language: "fr",
      timezone: "Europe/London",
      itemsPerPage: "25",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected success")
    expect(result.value).toEqual({
      preferences: { language: "fr", timezone: "Europe/London", itemsPerPage: 25 },
    })
  })
})

describe("notificationsFormSchema", () => {
  it("reads checkbox/switch presence as booleans", async () => {
    const result = await validateWithSchema(notificationsFormSchema(), {
      email: "on",
      sms: "on",
      profileVisible: "on",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected success")
    expect(result.value).toEqual({
      notifications: { email: true, push: false, sms: true },
      privacy: { profileVisible: true, showEmail: false },
    })
  })
})
