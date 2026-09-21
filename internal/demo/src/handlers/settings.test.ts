import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { createMockApi } from "../api"
import { createMockServer } from "../server"

// Settings authorization is proven at the server boundary so client gates remain UX affordances.

const api = createMockApi({
  authorizeSettingsRead: () => false,
  authorizeSettingsMutation: () => false,
})
const server = createMockServer(api)
const base = "http://localhost"

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => api.reset())
afterAll(() => server.close())

describe("settings authorization", () => {
  it("denies reads, PATCH writes, and resets before touching the store", async () => {
    expect((await fetch(`${base}/api/settings?userId=u1`)).status).toBe(403)
    const initial = api.settings.get("u1")

    const patch = await fetch(`${base}/api/settings?userId=u1`, {
      method: "PATCH",
      body: JSON.stringify({ preferences: { language: "fr" } }),
    })
    expect(patch.status).toBe(403)
    expect(api.settings.get("u1")).toEqual(initial)

    api.settings.save("u1", { preferences: { language: "es" } })
    const saved = api.settings.get("u1")

    const reset = await fetch(`${base}/api/settings/reset?userId=u1`, { method: "POST" })
    expect(reset.status).toBe(403)
    expect(api.settings.get("u1")).toEqual(saved)
  })
})
