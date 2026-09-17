import { createMockIdp } from "@plainworks/testkit"
import { beforeAll, describe, expect, it } from "vitest"
import { createNextAuth, type NextAuth } from "./auth"

// The host authenticates through `@plainworks/auth`'s own `createServerSession`, never a
// hand-assembled cookie/signer flow. An in-process mock IdP mints a real signed session across a
// full Authorization Code + PKCE round-trip, and the read seam resolves the client-safe identity
// slice the RSC layout gates on — proving token custody stays server-side (only identity, never a
// token, leaves this module).

const REDIRECT_URI = "https://next-host.test/auth/callback"

let auth: NextAuth
let idp: Awaited<ReturnType<typeof createMockIdp>>

/** Fold a batch of `Set-Cookie` entries into an inbound jar the way a browser would. */
function applyCookies(setCookies: readonly string[], inbound: Map<string, string>): void {
  for (const cookie of setCookies) {
    const eq = cookie.indexOf("=")
    const semi = cookie.indexOf(";")
    const name = cookie.slice(0, eq)
    const value = cookie.slice(eq + 1, semi === -1 ? undefined : semi)
    if (/Max-Age=0(?:;|$)/.test(cookie)) {
      inbound.delete(name)
    } else {
      inbound.set(name, value)
    }
  }
}

function jarOver(inbound: Map<string, string>, outbound: string[]) {
  return {
    get: (name: string) => inbound.get(name),
    set: (cookie: string) => outbound.push(cookie),
  }
}

function cookieHeader(inbound: Map<string, string>): string {
  return [...inbound].map(([name, value]) => `${name}=${value}`).join("; ")
}

/** Drive a real login round-trip and return the inbound jar it left (session + CSRF cookies). */
async function login(): Promise<Map<string, string>> {
  const inbound = new Map<string, string>()
  const outbound: string[] = []
  const begin = await auth.session.beginLogin(jarOver(inbound, outbound), { returnTo: "/tasks" })
  applyCookies(outbound.splice(0), inbound)
  const { callbackUrl } = idp.authorize(begin.authorizationUrl)
  const params = Object.fromEntries(new URL(callbackUrl).searchParams)
  await auth.session.completeLogin(jarOver(inbound, outbound), { params })
  applyCookies(outbound.splice(0), inbound)
  return inbound
}

beforeAll(async () => {
  idp = await createMockIdp({ claims: { name: "Ada Lovelace" } })
  auth = createNextAuth({
    fetch: idp.fetch,
    issuer: idp.issuer,
    clientId: idp.clientId,
    redirectUri: REDIRECT_URI,
    signingKey: new Uint8Array(32).fill(7),
  })
})

describe("session read", () => {
  it("resolves the named identity from a minted session cookie", async () => {
    const snapshot = await auth.read(cookieHeader(await login()))
    expect(snapshot).toEqual({
      authenticated: true,
      subject: expect.any(String),
      name: "Ada Lovelace",
    })
  })

  it("resolves the anonymous snapshot when no session cookie is present", async () => {
    expect(await auth.read("")).toEqual({ authenticated: false, subject: null, name: null })
  })

  it("clears the session on logout so a later read is anonymous", async () => {
    const inbound = await login()
    const outbound: string[] = []
    await auth.session.logout({ get: (n) => inbound.get(n), set: (c) => outbound.push(c) })
    applyCookies(outbound, inbound)
    expect(await auth.read(cookieHeader(inbound))).toEqual({
      authenticated: false,
      subject: null,
      name: null,
    })
  })
})
