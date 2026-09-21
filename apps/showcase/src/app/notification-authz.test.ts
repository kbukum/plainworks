import { encodeSession } from "@plainworks/auth"
import { createMockServerHandle } from "@plainworks/demo/server"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { type ShowcaseSessionValue, showcaseSessionCodec, showcaseSessionReader } from "./auth"
import {
  NOTIFICATION_MUTATION_HEADER,
  NOTIFICATION_MUTATION_HEADER_VALUE,
  SESSION_COOKIE,
} from "./constants"
import { createNotificationMutationAuthorizer } from "./notification-authz"

// The notification mutation boundary proven where it is enforced — the mock backend. The client
// `<Can>` gate only hides the act-on controls; this seam is the real authorization. It verifies the
// signed session cookie the BFF issues (a forged or tampered value never passes) and applies the
// same named-identity policy as the gate, so only a signed-in user carrying a valid cookie is
// served — across the per-row writes and the bulk mark-all-read alike.

const SIGNING_KEY = new TextEncoder().encode("showcase-notification-authz-test-signing-key")
const codec = showcaseSessionCodec(SIGNING_KEY)
const authorize = createNotificationMutationAuthorizer(showcaseSessionReader(SIGNING_KEY))
const base = "http://showcase.test"

async function signedCookie(value: ShowcaseSessionValue): Promise<string> {
  return `${SESSION_COOKIE}=${await encodeSession(codec, value)}`
}

function patchRequest(cookie?: string, mutationHeader = true): Request {
  return new Request(`${base}/api/notifications/n1`, {
    method: "PATCH",
    headers: {
      ...(cookie === undefined ? {} : { cookie }),
      ...(mutationHeader
        ? { [NOTIFICATION_MUTATION_HEADER]: NOTIFICATION_MUTATION_HEADER_VALUE }
        : {}),
    },
  })
}

describe("createNotificationMutationAuthorizer", () => {
  it("accepts a request carrying a validly-signed, named session cookie", async () => {
    const request = patchRequest(await signedCookie({ subject: "user-123", name: "Ada" }))
    expect(await authorize(request)).toBe(true)
  })

  it("rejects a forged cookie value under the session name", async () => {
    expect(await authorize(patchRequest(`${SESSION_COOKIE}=forged.value`))).toBe(false)
  })

  it("rejects a validly-signed session with no name (fails the manage policy)", async () => {
    const request = patchRequest(await signedCookie({ subject: "guest-1" }))
    expect(await authorize(request)).toBe(false)
  })

  it("rejects a request with no cookie header", async () => {
    expect(await authorize(patchRequest())).toBe(false)
  })

  it("rejects a valid session without the non-simple mutation header", async () => {
    const request = patchRequest(await signedCookie({ subject: "user-123", name: "Ada" }), false)
    expect(await authorize(request)).toBe(false)
  })
})

describe("notification mutation boundary", () => {
  const handle = createMockServerHandle({ seed: 5, authorizeNotificationMutation: authorize })

  beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
  afterEach(() => {
    handle.server.resetHandlers()
    handle.api.reset()
  })
  afterAll(() => handle.server.close())

  it("rejects mark-read and mark-all-read from a caller without a session (403)", async () => {
    const notification = handle.api.stores.notifications.getAll()[0]
    if (notification === undefined) throw new Error("expected a seeded notification")

    const patch = await fetch(`${base}/api/notifications/${notification.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ read: true }),
    })
    expect(patch.status).toBe(403)

    const bulk = await fetch(`${base}/api/notifications/read-all`, { method: "POST" })
    expect(bulk.status).toBe(403)
  })

  it("rejects bodyless mark-all-read with a valid session but no mutation proof", async () => {
    const before = handle.api.stores.notifications.getAll().filter((row) => !row.read).length
    const bulk = await fetch(`${base}/api/notifications/read-all`, {
      method: "POST",
      headers: { cookie: await signedCookie({ subject: "user-123", name: "Ada" }) },
    })

    expect(bulk.status).toBe(403)
    expect(handle.api.stores.notifications.getAll().filter((row) => !row.read)).toHaveLength(before)
  })

  it("serves mark-read for a caller carrying a valid session cookie", async () => {
    const notification = handle.api.stores.notifications.getAll()[0]
    if (notification === undefined) throw new Error("expected a seeded notification")

    const res = await fetch(`${base}/api/notifications/${notification.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: await signedCookie({ subject: "user-123", name: "Ada" }),
        [NOTIFICATION_MUTATION_HEADER]: NOTIFICATION_MUTATION_HEADER_VALUE,
      },
      body: JSON.stringify({ read: true }),
    })
    const body = (await res.json()) as { data: { read: boolean } | null }

    expect(res.status).toBe(200)
    expect(body.data?.read).toBe(true)
  })
})
