import { systemClock } from "@plainworks/std"
import { createMockIdp, guardSchema } from "@plainworks/testkit"
import { describe, expect, test } from "vitest"
import { oidcAdapter } from "../adapter/oidc"
import { defaultAuthCrypto } from "../crypto"
import { AuthError } from "../errors"
import { hmacSessionSigner } from "./hmac-signer"
import { createServerSession, type ServerSession, type ServerSessionJar } from "./server-session"

const REDIRECT_URI = "https://app.test/auth/callback"

interface SessionValue {
  readonly subject: string
}

const sessionSchema = guardSchema<SessionValue>(
  (value): value is SessionValue =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as { subject?: unknown }).subject === "string",
)

/**
 * An in-memory cookie jar that models one browser: `set` records outbound `Set-Cookie` entries, and
 * `commit()` folds them back into the inbound store the way a browser sends stored cookies on the
 * next request (honoring `Max-Age=0` deletions), so a test can walk the multi-request login flow.
 */
function browserJar(): ServerSessionJar & { commit(): void } {
  const inbound = new Map<string, string>()
  const outbound = new Map<string, string | null>()
  return {
    get: (name) => inbound.get(name),
    set(setCookie) {
      const eq = setCookie.indexOf("=")
      const semi = setCookie.indexOf(";")
      const name = setCookie.slice(0, eq)
      const value = setCookie.slice(eq + 1, semi === -1 ? undefined : semi)
      outbound.set(name, /Max-Age=0(?:;|$)/.test(setCookie) ? null : value)
    },
    commit() {
      for (const [name, value] of outbound) {
        if (value === null) {
          inbound.delete(name)
        } else {
          inbound.set(name, value)
        }
      }
      outbound.clear()
    },
  }
}

async function buildSession(): Promise<{
  session: ServerSession<typeof sessionSchema>
  idp: Awaited<ReturnType<typeof createMockIdp>>
}> {
  const idp = await createMockIdp()
  const signer = hmacSessionSigner({ keys: [new Uint8Array(32).fill(0x22)] })
  const adapter = oidcAdapter(
    {
      kind: "oidc",
      issuer: idp.issuer,
      clientId: idp.clientId,
      redirectUri: REDIRECT_URI,
      signer,
      fetch: idp.fetch,
    },
    { crypto: defaultAuthCrypto(), clock: systemClock },
  )
  const session = createServerSession({
    adapter,
    signer,
    sessionSchema,
    toSessionValue: (result) => ({ subject: result.identity.subject }),
    guard: { loginPath: "/login" },
  })
  return { session, idp }
}

/** Drive a full begin → authorize → complete login, returning the jar mid-flow. */
async function login(
  session: ServerSession<typeof sessionSchema>,
  idp: Awaited<ReturnType<typeof createMockIdp>>,
  returnTo?: string,
): Promise<ReturnType<typeof browserJar>> {
  const jar = browserJar()
  const begin = await session.beginLogin(jar, returnTo === undefined ? {} : { returnTo })
  jar.commit()
  const { callbackUrl } = idp.authorize(begin.authorizationUrl)
  const params = Object.fromEntries(new URL(callbackUrl).searchParams)
  await session.completeLogin(jar, { params })
  jar.commit()
  return jar
}

describe("createServerSession login flow", () => {
  test("mints a readable session across the begin → callback round trip", async () => {
    const { session, idp } = await buildSession()
    const jar = await login(session, idp)
    expect(await session.read(jar)).toEqual({ subject: "user-123" })
  })

  test("carries the sanitized return target through the transaction", async () => {
    const { session, idp } = await buildSession()
    const jar = browserJar()
    const begin = await session.beginLogin(jar, { returnTo: "/dashboard" })
    jar.commit()
    const { callbackUrl } = idp.authorize(begin.authorizationUrl)
    const params = Object.fromEntries(new URL(callbackUrl).searchParams)
    const result = await session.completeLogin(jar, { params })
    expect(result.returnTo).toBe("/dashboard")
  })

  test("collapses an off-origin return target to the fallback", async () => {
    const { session, idp } = await buildSession()
    const jar = browserJar()
    const begin = await session.beginLogin(jar, { returnTo: "https://evil.test/phish" })
    jar.commit()
    const { callbackUrl } = idp.authorize(begin.authorizationUrl)
    const params = Object.fromEntries(new URL(callbackUrl).searchParams)
    const result = await session.completeLogin(jar, { params })
    expect(result.returnTo).toBe("/")
  })
})

describe("createServerSession guard", () => {
  test("redirects an unauthenticated caller to the login route with the return path", async () => {
    const { session } = await buildSession()
    const redirect = await session.guard(browserJar(), "/tasks")
    expect(redirect).not.toBeNull()
    expect(redirect?.to).toBe("/login?returnTo=%2Ftasks")
    expect(redirect?.reason).toBe("unauthenticated")
  })

  test("lets an authenticated caller through", async () => {
    const { session, idp } = await buildSession()
    const jar = await login(session, idp)
    expect(await session.guard(jar, "/tasks")).toBeNull()
  })
})

describe("createServerSession CSRF", () => {
  test("accepts a double-submit echo of the session-bound token", async () => {
    const { session, idp } = await buildSession()
    const jar = await login(session, idp)
    const csrfToken = jar.get("__Host-csrf") ?? ""
    expect(csrfToken).not.toBe("")
    expect(await session.verifyCsrf(jar, csrfToken)).toBe(true)
  })

  test("rejects a missing or mismatched CSRF echo", async () => {
    const { session, idp } = await buildSession()
    const jar = await login(session, idp)
    expect(await session.verifyCsrf(jar, "")).toBe(false)
    expect(await session.verifyCsrf(jar, "not-the-token")).toBe(false)
  })

  test("rejects CSRF when there is no valid session", async () => {
    const { session } = await buildSession()
    expect(await session.verifyCsrf(browserJar(), "anything")).toBe(false)
  })
})

describe("createServerSession teardown and failure paths", () => {
  test("logout clears the session so a later read is unauthenticated", async () => {
    const { session, idp } = await buildSession()
    const jar = await login(session, idp)
    await session.logout(jar)
    jar.commit()
    expect(await session.read(jar)).toBeUndefined()
    expect(await session.guard(jar, "/tasks")).not.toBeNull()
  })

  test("a tampered session cookie reads as unauthenticated, never an error", async () => {
    const { session, idp } = await buildSession()
    const jar = await login(session, idp)
    const raw = jar.get("__Host-session") ?? ""
    jar.set(
      `__Host-session=${raw}tampered; Path=/; SameSite=Strict; Max-Age=3600; Secure; HttpOnly`,
    )
    jar.commit()
    expect(await session.read(jar)).toBeUndefined()
  })

  test("completeLogin without a transaction cookie is a typed auth/adapter error", async () => {
    const { session } = await buildSession()
    await expect(
      session.completeLogin(browserJar(), { params: { code: "x", state: "y" } }),
    ).rejects.toMatchObject({ kind: "auth/adapter" })
  })

  test("completeLogin rejects a forged transaction cookie", async () => {
    const { session } = await buildSession()
    const jar = browserJar()
    jar.set("__Host-login_tx=forged.value; Path=/; SameSite=Lax; Max-Age=600; Secure; HttpOnly")
    jar.commit()
    await expect(
      session.completeLogin(jar, { params: { code: "x", state: "y" } }),
    ).rejects.toBeInstanceOf(AuthError)
  })

  test("concurrent users maintain independent sessions and token custody", async () => {
    const { session, idp } = await buildSession()
    // User 1 logs in
    const jar1 = await login(session, idp)
    // User 2 logs in
    const jar2 = await login(session, idp)

    // User 1 refreshes
    const r1 = await session.refresh(jar1)
    expect(r1?.accessToken).toBeTruthy()

    // User 1 logs out
    await session.logout(jar1)
    jar1.commit()

    // User 2's session and refresh are unaffected by User 1's logout
    expect(await session.read(jar2)).toEqual({ subject: "user-123" })
    const r2 = await session.refresh(jar2)
    expect(r2?.accessToken).toBeTruthy()

    // User 1 cannot refresh after logout
    expect(await session.refresh(jar1)).toBeUndefined()
  })

  test("validates configuration TTLs and bounds", () => {
    const signer = hmacSessionSigner({ keys: [new Uint8Array(32).fill(0x22)] })
    const adapter = { beginLogin: () => {}, completeLogin: () => {} } as never
    const baseConfig = {
      signer,
      adapter,
      sessionSchema,
      toSessionValue: (s: { identity: { subject: string } }) => ({ subject: s.identity.subject }),
    }

    expect(() => createServerSession({ ...baseConfig, ttlSeconds: 0 })).toThrowError(AuthError)
    expect(() => createServerSession({ ...baseConfig, ttlSeconds: -1 })).toThrowError(AuthError)
    expect(() => createServerSession({ ...baseConfig, ttlSeconds: 1.5 })).toThrowError(AuthError)
    expect(() => createServerSession({ ...baseConfig, transactionTtlSeconds: 0 })).toThrowError(
      AuthError,
    )
    expect(() => createServerSession({ ...baseConfig, transactionTtlSeconds: -10 })).toThrowError(
      AuthError,
    )
    expect(() => createServerSession({ ...baseConfig, clockSkewSeconds: -1 })).toThrowError(
      AuthError,
    )
    expect(() => createServerSession({ ...baseConfig, maxAgeSeconds: 0 })).toThrowError(AuthError)
    expect(() => createServerSession({ ...baseConfig, maxAgeSeconds: -5 })).toThrowError(AuthError)
  })

  test("refresh returns undefined when session cookie is tampered or expired", async () => {
    const { session, idp } = await buildSession()
    const jar = await login(session, idp)

    // Tampered cookie returns undefined instead of throwing
    jar.set("__Host-session=tampered.envelope; Path=/; SameSite=Strict; Secure; HttpOnly")
    jar.commit()
    expect(await session.refresh(jar)).toBeUndefined()
  })
})
