import { createUserSettings } from "@plainworks/demo"
import { createHttpClient } from "@plainworks/http"
import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { SETTINGS_MUTATION_HEADER, SETTINGS_MUTATION_HEADER_VALUE } from "./constants"
import { updateSettings } from "./settings-write"

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const client = createHttpClient({ baseUrl: "http://test.local" })

describe("settings-write", () => {
  it("sends the mutation proof, userId, and body, and returns the merged record", async () => {
    let header: string | null = null
    let userId: string | null = null
    let body: unknown
    const merged = {
      ...createUserSettings("user-1"),
      profile: { ...createUserSettings("user-1").profile, displayName: "Grace" },
    }
    server.use(
      http.patch("http://test.local/api/settings", async ({ request }) => {
        header = request.headers.get(SETTINGS_MUTATION_HEADER)
        userId = new URL(request.url).searchParams.get("userId")
        body = await request.json()
        return HttpResponse.json({ data: merged })
      }),
    )

    const result = await updateSettings(client, "user-1", { profile: { displayName: "Grace" } })

    expect(result.profile.displayName).toBe("Grace")
    expect(header).toBe(SETTINGS_MUTATION_HEADER_VALUE)
    expect(userId).toBe("user-1")
    expect(body).toEqual({ profile: { displayName: "Grace" } })
  })

  it("rejects a malformed settings envelope", async () => {
    server.use(
      http.patch("http://test.local/api/settings", () =>
        HttpResponse.json({ data: { userId: "user-1" } }),
      ),
    )

    await expect(
      updateSettings(client, "user-1", { preferences: { language: "fr" } }),
    ).rejects.toThrow()
  })

  it("rejects a bodyless mutation response", async () => {
    server.use(
      http.patch("http://test.local/api/settings", () => new HttpResponse(null, { status: 204 })),
    )

    await expect(updateSettings(client, "user-1", {})).rejects.toThrow(
      "PATCH /api/settings returned no body",
    )
  })
})
