import { afterEach, describe, expect, it } from "vitest"
import { BACKEND_SUBJECT, createShowcaseBackend, type ShowcaseBackend } from "../../../test/backend"
import { SETTINGS_MUTATION_HEADER, SETTINGS_MUTATION_HEADER_VALUE } from "../constants"

let backend: ShowcaseBackend | undefined
afterEach(() => backend?.close())

const MUTATION = { [SETTINGS_MUTATION_HEADER]: SETTINGS_MUTATION_HEADER_VALUE }
const OTHER_USER = "grace"

function saveJobTitle(
  target: ShowcaseBackend,
  userId: string,
  headers: Record<string, string>,
): Promise<Response> {
  return target.send(`/api/settings?userId=${userId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ profile: { jobTitle: "Analyst" } }),
  })
}

describe("settings at the backend boundary", () => {
  it("an opaque session reads and writes only its own record", async () => {
    backend = await createShowcaseBackend()
    const cookie = await backend.signIn()
    const own = await backend.send(`/api/settings?userId=${BACKEND_SUBJECT}`, {
      headers: { cookie },
    })
    expect(own.status).toBe(200)
    expect((await saveJobTitle(backend, BACKEND_SUBJECT, { ...MUTATION, cookie })).status).toBe(200)
    expect(backend.api.settings.get(BACKEND_SUBJECT).profile.jobTitle).toBe("Analyst")

    const before = structuredClone(backend.api.settings.get(OTHER_USER))
    const other = await backend.send(`/api/settings?userId=${OTHER_USER}`, { headers: { cookie } })
    expect(other.status).toBe(403)
    expect((await saveJobTitle(backend, OTHER_USER, { ...MUTATION, cookie })).status).toBe(403)
    expect(backend.api.settings.get(OTHER_USER)).toEqual(before)
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
  ] as const)("%s cannot write and the record is unchanged", async (_, headersOf, claims) => {
    backend = await createShowcaseBackend(claims)
    const headers = await headersOf(backend)
    const before = structuredClone(backend.api.settings.get(BACKEND_SUBJECT))
    expect((await saveJobTitle(backend, BACKEND_SUBJECT, headers)).status).toBe(403)
    expect(backend.api.settings.get(BACKEND_SUBJECT)).toEqual(before)
  })

  it("unavailable session storage fails reads and writes and the record is unchanged", async () => {
    backend = await createShowcaseBackend()
    const cookie = await backend.signIn()
    const before = structuredClone(backend.api.settings.get(BACKEND_SUBJECT))
    backend.failStorage()
    const read = await backend.send(`/api/settings?userId=${BACKEND_SUBJECT}`, {
      headers: { cookie },
    })
    expect(read.status).toBe(500)
    expect((await saveJobTitle(backend, BACKEND_SUBJECT, { ...MUTATION, cookie })).status).toBe(500)
    expect(backend.api.settings.get(BACKEND_SUBJECT)).toEqual(before)
  })
})
