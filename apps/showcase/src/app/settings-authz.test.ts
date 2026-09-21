import { encodeSession } from "@plainworks/auth"
import { createMockServerHandle } from "@plainworks/demo/server"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { type ShowcaseSessionValue, showcaseSessionCodec, showcaseSessionReader } from "./auth"
import {
  SESSION_COOKIE,
  SETTINGS_MUTATION_HEADER,
  SETTINGS_MUTATION_HEADER_VALUE,
} from "./constants"
import { createSettingsMutationAuthorizer, createSettingsReadAuthorizer } from "./settings-authz"

// The settings mutation boundary proven where it is enforced — the mock backend. The client gate
// only hides the save controls; this seam is the real authorization. It verifies the signed session
// cookie, applies the named-identity policy, and scopes the write to the caller's own `userId`.

const SIGNING_KEY = new TextEncoder().encode("showcase-settings-authz-test-signing-key")
const codec = showcaseSessionCodec(SIGNING_KEY)
const authorize = createSettingsMutationAuthorizer(showcaseSessionReader(SIGNING_KEY))
const authorizeRead = createSettingsReadAuthorizer(showcaseSessionReader(SIGNING_KEY))
const base = "http://showcase.test"

async function signedCookie(value: ShowcaseSessionValue): Promise<string> {
  return `${SESSION_COOKIE}=${await encodeSession(codec, value)}`
}

function patchRequest(options: {
  cookie?: string
  userId?: string
  mutationHeader?: boolean
}): Request {
  const { cookie, userId = "user-123", mutationHeader = true } = options
  return new Request(`${base}/api/settings?userId=${userId}`, {
    method: "PATCH",
    headers: {
      ...(cookie === undefined ? {} : { cookie }),
      ...(mutationHeader ? { [SETTINGS_MUTATION_HEADER]: SETTINGS_MUTATION_HEADER_VALUE } : {}),
    },
  })
}

describe("createSettingsMutationAuthorizer", () => {
  it("accepts a named session editing its own settings", async () => {
    const cookie = await signedCookie({ subject: "user-123", name: "Ada" })
    expect(await authorize(patchRequest({ cookie }))).toBe(true)
  })

  describe("createSettingsReadAuthorizer", () => {
    it("accepts an authenticated session reading its own settings", async () => {
      const cookie = await signedCookie({ subject: "user-123" })
      expect(
        await authorizeRead(
          new Request(`${base}/api/settings?userId=user-123`, {
            headers: { cookie },
          }),
        ),
      ).toBe(true)
    })

    it("rejects unauthenticated and cross-user reads", async () => {
      expect(await authorizeRead(new Request(`${base}/api/settings?userId=user-123`))).toBe(false)
      const cookie = await signedCookie({ subject: "user-123", name: "Ada" })
      expect(
        await authorizeRead(
          new Request(`${base}/api/settings?userId=someone-else`, {
            headers: { cookie },
          }),
        ),
      ).toBe(false)
    })
  })

  it("rejects a named session editing another user's settings", async () => {
    const cookie = await signedCookie({ subject: "user-123", name: "Ada" })
    expect(await authorize(patchRequest({ cookie, userId: "someone-else" }))).toBe(false)
  })

  it("rejects a validly-signed session with no name", async () => {
    const cookie = await signedCookie({ subject: "user-123" })
    expect(await authorize(patchRequest({ cookie }))).toBe(false)
  })

  it("rejects a forged cookie value", async () => {
    expect(await authorize(patchRequest({ cookie: `${SESSION_COOKIE}=forged.value` }))).toBe(false)
  })

  it("rejects a request with no cookie header", async () => {
    expect(await authorize(patchRequest({}))).toBe(false)
  })

  it("rejects a valid session without the non-simple mutation header", async () => {
    const cookie = await signedCookie({ subject: "user-123", name: "Ada" })
    expect(await authorize(patchRequest({ cookie, mutationHeader: false }))).toBe(false)
  })
})

describe("settings mutation boundary", () => {
  const handle = createMockServerHandle({
    authorizeSettingsRead: authorizeRead,
    authorizeSettingsMutation: authorize,
  })

  beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
  afterEach(() => {
    handle.server.resetHandlers()
    handle.api.reset()
  })
  afterAll(() => handle.server.close())

  it("rejects a PATCH from a caller without a session (403)", async () => {
    const patch = await fetch(`${base}/api/settings?userId=user-123`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preferences: { language: "fr" } }),
    })
    expect(patch.status).toBe(403)
  })

  it("rejects a GET without a session and serves the signed-in user's own record", async () => {
    expect((await fetch(`${base}/api/settings?userId=user-123`)).status).toBe(403)

    const response = await fetch(`${base}/api/settings?userId=user-123`, {
      headers: { cookie: await signedCookie({ subject: "user-123" }) },
    })
    expect(response.status).toBe(200)
  })

  it("serves a PATCH for a named session editing its own settings", async () => {
    const res = await fetch(`${base}/api/settings?userId=user-123`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: await signedCookie({ subject: "user-123", name: "Ada" }),
        [SETTINGS_MUTATION_HEADER]: SETTINGS_MUTATION_HEADER_VALUE,
      },
      body: JSON.stringify({ preferences: { language: "fr" } }),
    })
    const body = (await res.json()) as { data: { preferences: { language: string } } | null }

    expect(res.status).toBe(200)
    expect(body.data?.preferences.language).toBe("fr")
  })
})
