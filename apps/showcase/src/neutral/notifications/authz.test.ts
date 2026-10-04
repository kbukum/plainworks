import { afterEach, describe, expect, it } from "vitest"
import { createShowcaseBackend, type ShowcaseBackend } from "../../../test/backend"
import { NOTIFICATION_MUTATION_HEADER, NOTIFICATION_MUTATION_HEADER_VALUE } from "../constants"

let backend: ShowcaseBackend | undefined
afterEach(() => backend?.close())

const MUTATION = { [NOTIFICATION_MUTATION_HEADER]: NOTIFICATION_MUTATION_HEADER_VALUE }

function markAllRead(target: ShowcaseBackend, headers: Record<string, string>) {
  return target.send("/api/notifications/read-all", { method: "POST", headers })
}

function unread(target: ShowcaseBackend): number {
  return target.api.stores.notifications.getAll().filter((item) => !item.read).length
}

describe("notification writes at the backend boundary", () => {
  it("a named operator's opaque session marks every notification read", async () => {
    backend = await createShowcaseBackend()
    expect(unread(backend)).toBeGreaterThan(0)
    const response = await markAllRead(backend, { ...MUTATION, cookie: await backend.signIn() })
    expect(response.status).toBe(200)
    expect(unread(backend)).toBe(0)
  })

  it.each([
    ["a guest", async () => MUTATION, { name: "Ada" }],
    [
      "a forged session cookie",
      async () => ({ ...MUTATION, cookie: "__Host-session=forged" }),
      {
        name: "Ada",
      },
    ],
    [
      "a missing mutation header",
      async (b: ShowcaseBackend) => ({ cookie: await b.signIn() }),
      {
        name: "Ada",
      },
    ],
    [
      "an unnamed identity",
      async (b: ShowcaseBackend) => ({
        ...MUTATION,
        cookie: await b.signIn(),
      }),
      {},
    ],
  ] as const)("%s is denied and no notification changes", async (_, headersOf, claims) => {
    backend = await createShowcaseBackend(claims)
    const headers = await headersOf(backend)
    const before = structuredClone(backend.api.stores.notifications.getAll())
    expect((await markAllRead(backend, headers)).status).toBe(403)
    expect(backend.api.stores.notifications.getAll()).toEqual(before)
  })

  it("unavailable session storage fails the write and no notification changes", async () => {
    backend = await createShowcaseBackend()
    const cookie = await backend.signIn()
    const before = structuredClone(backend.api.stores.notifications.getAll())
    backend.failStorage()
    expect((await markAllRead(backend, { ...MUTATION, cookie })).status).toBe(500)
    expect(backend.api.stores.notifications.getAll()).toEqual(before)
  })
})
