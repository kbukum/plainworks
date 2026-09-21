import { createUserSettings } from "@plainworks/demo"
import { createHttpClient } from "@plainworks/http"
import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { readSettings, settingsQueryKey } from "./settings-read"

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const client = createHttpClient({ baseUrl: "http://test.local" })

describe("settings-read", () => {
  it("keys the cache by resource and user", () => {
    expect(settingsQueryKey("user-1")).toEqual(["settings", "user-1"])
  })

  it("reads and validates one user's settings", async () => {
    const settings = createUserSettings("user-1")
    let requestedUser: string | null = null
    server.use(
      http.get("http://test.local/api/settings", ({ request }) => {
        requestedUser = new URL(request.url).searchParams.get("userId")
        return HttpResponse.json({ data: settings })
      }),
    )

    await expect(readSettings(client, "user-1")).resolves.toEqual(settings)
    expect(requestedUser).toBe("user-1")
  })

  it("rejects a malformed envelope", async () => {
    server.use(
      http.get("http://test.local/api/settings", () =>
        HttpResponse.json({ data: { userId: "user-1" } }),
      ),
    )

    await expect(readSettings(client, "user-1")).rejects.toThrow()
  })

  it("rejects a bodyless response", async () => {
    server.use(
      http.get("http://test.local/api/settings", () => new HttpResponse(null, { status: 204 })),
    )

    await expect(readSettings(client, "user-1")).rejects.toThrow(
      "GET /api/settings returned no body",
    )
  })
})
