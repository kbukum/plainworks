import { isRecord } from "@plainworks/std"
import { base64urlEncode } from "@plainworks/std/encoding"
import { guardSchema } from "@plainworks/std/seam"
import type { WebAbortSignal } from "@plainworks/std/web"
import { deferred, manualClock } from "@plainworks/testkit"
import { describe, expect, test, vi } from "vitest"
import type { AuthAdapter } from "../adapter"
import { defaultAuthCrypto } from "../crypto"
import { AuthError } from "../errors"
import { hmacSessionSigner } from "./hmac-signer"
import {
  createMemorySessionStore,
  type OpaqueSessionStore,
  type StoredSession,
} from "./opaque-store"
import { createServerSession, type ServerSessionJar } from "./server-session"

interface Value {
  readonly subject: string
}
const schema = guardSchema<Value>(
  (value): value is Value => isRecord(value) && typeof value.subject === "string",
)

function browserJar(): ServerSessionJar & { entries: string[]; commit(): void } {
  const inbound = new Map<string, string>()
  const entries: string[] = []
  return {
    entries,
    get: (name) => inbound.get(name),
    set: (cookie) => entries.push(cookie),
    commit() {
      for (const cookie of entries.splice(0)) {
        const [pair] = cookie.split(";")
        if (pair === undefined) throw new Error("missing cookie pair")
        const index = pair.indexOf("=")
        const name = pair.slice(0, index)
        if (cookie.includes("Max-Age=0")) inbound.delete(name)
        else inbound.set(name, pair.slice(index + 1))
      }
    },
  }
}

function setup(store?: OpaqueSessionStore<Value>, adapterOverride?: AuthAdapter) {
  const clock = manualClock(0)
  const memory = createMemorySessionStore<Value>({ clock, schema })
  const adapter: AuthAdapter = adapterOverride ?? {
    id: "test-verifier",
    authenticate: async () => null,
    beginLogin: async () => ({ authorizationUrl: "https://idp.test", transaction: "pkce" }),
    completeLogin: async () => ({
      identity: { subject: "ada", claims: {} },
      tokens: { accessToken: "server-only", expiresAt: 1000 },
      sessionHandle: "provider-slot",
    }),
    refresh: async () => ({ accessToken: "server-refresh", expiresAt: 2000 }),
    logout: async () => {},
  }
  const config = {
    adapter,
    store: store ?? memory,
    sessionSchema: schema,
    signer: hmacSessionSigner({ keys: [new Uint8Array(32).fill(22)] }),
    crypto: defaultAuthCrypto(),
    clock,
    toSessionValue: () => ({ subject: "ada" }),
    toIdentity: (value: Value) => ({
      subject: value.subject,
      kind: "user" as const,
      restrictions: { mode: "unrestricted" as const },
    }),
    guard: { loginPath: "/login" },
  }
  return { session: createServerSession(config), config, clock, memory }
}

async function login(session: ReturnType<typeof setup>["session"], jar = browserJar()) {
  await session.beginLogin(jar, { returnTo: "/dashboard" })
  jar.commit()
  await session.completeLogin(jar, { params: {} })
  return jar
}

describe("opaque server session", () => {
  test("failed persistence admission releases newly verified provider custody", async () => {
    const base = setup()
    const logout = vi.fn<NonNullable<AuthAdapter["logout"]>>(async () => {})
    const session = createServerSession({
      ...base.config,
      adapter: { ...base.config.adapter, logout },
      store: {
        ...base.memory,
        create: async () => {
          throw new Error("store unavailable")
        },
      },
    })
    const jar = browserJar()
    await expect(login(session, jar)).rejects.toThrow("store unavailable")
    expect(logout).toHaveBeenCalledOnce()
    expect(logout.mock.calls[0]?.[0].sessionHandle).toBe("provider-slot")
    expect(jar.entries.some((entry) => entry.startsWith("__Host-session="))).toBe(false)
  })
  test("only a random 32-byte credential enters the exact hardened cookie", async () => {
    const records: StoredSession<Value>[] = []
    const backing = createMemorySessionStore<Value>({ clock: manualClock(0), schema })
    const store: OpaqueSessionStore<Value> = {
      ...backing,
      async create(record, previous, signal) {
        records.push(record)
        await backing.create(record, previous, signal)
      },
    }
    const { session } = setup(store)
    const jar = await login(session)
    expect(jar.get("__Host-login_tx")).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const cookie = jar.entries.find((entry) => entry.startsWith("__Host-session="))
    expect(cookie).toMatch(/^__Host-session=[A-Za-z0-9_-]{43};/)
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("Secure")
    expect(cookie).toContain("SameSite=Strict")
    expect(cookie).toContain("Path=/")
    expect(cookie).not.toContain("Domain=")
    expect(cookie).not.toContain("ada")
    expect(cookie).not.toContain("server-only")
    jar.commit()
    expect(records[0]?.reference).not.toBe(jar.get("__Host-session"))
    expect(await session.read(jar)).toEqual({ subject: "ada" })
    const status = await session.status(jar)
    expect(status).toMatchObject({
      status: "authenticated",
      identity: { subject: "ada", kind: "user" },
      expiresAt: "1970-01-01T01:00:00.000Z",
    })
    expect(jar.entries).toEqual([])
    expect(await session.verifyCsrf(jar, status.csrfToken)).toBe(true)
    expect(await session.verifyCsrf(jar, "forged")).toBe(false)
    expect(await session.verifyCsrf(jar, "x".repeat(257))).toBe(false)
  })

  test("provider refresh stays server-only, and logout revokes before deletion", async () => {
    const { session } = setup()
    const jar = await login(session)
    jar.commit()
    expect(await session.refreshProvider(jar)).toMatchObject({ accessToken: "server-refresh" })
    await session.logout(jar)
    expect(await session.read(jar)).toBeUndefined()
    expect(jar.entries[0]).toContain("Max-Age=0")
    jar.commit()
    expect(await session.refreshProvider(jar)).toBeUndefined()
    expect(await session.guard(jar, "/tasks")).toMatchObject({ to: "/login?returnTo=%2Ftasks" })
  })

  test("expiry is authoritative and status rejects without a cookie renewal", async () => {
    const { session, clock } = setup()
    const jar = await login(session)
    jar.commit()
    clock.set(3_600_000)
    expect(await session.read(jar)).toBeUndefined()
    await expect(session.status(jar)).rejects.toMatchObject({ kind: "auth/unauthenticated" })
    expect(jar.entries).toEqual([])
  })

  test("store lookup and revoke failures propagate, and failed revoke sets no deletion", async () => {
    const store: OpaqueSessionStore<Value> = {
      ...createMemorySessionStore<Value>({ schema }),
      read: async () => {
        throw new AuthError("auth/store-unavailable", "writer down")
      },
      create: async () => {},
      revoke: async () => {
        throw new AuthError("auth/store-unavailable", "writer down")
      },
    }
    const { session } = setup(store)
    const jar = browserJar()
    jar.set(`__Host-session=${"A".repeat(43)}; Secure`)
    jar.commit()
    await expect(session.read(jar)).rejects.toMatchObject({ kind: "auth/store-unavailable" })
    await expect(session.verifyCsrf(jar, "proof")).rejects.toMatchObject({
      kind: "auth/store-unavailable",
    })
    await expect(session.logout(jar)).rejects.toMatchObject({ kind: "auth/store-unavailable" })
    expect(jar.entries).toEqual([])
  })

  test("malformed opaque credentials fail before storage; absent sessions are anonymous", async () => {
    const { session } = setup()
    const jar = browserJar()
    expect(await session.read(jar)).toBeUndefined()
    await expect(session.verifyCsrf(jar, "token")).rejects.toMatchObject({
      kind: "auth/unauthenticated",
    })
    jar.set("__Host-session=identity.signature; Secure")
    jar.commit()
    await expect(session.read(jar)).rejects.toMatchObject({ kind: "auth/session-invalid" })
  })

  test.each(["expired", "revoked"] as const)(
    "%s sessions reject write admission even with a previously valid CSRF proof",
    async (state) => {
      const { session, clock } = setup()
      const jar = await login(session)
      jar.commit()
      const { csrfToken } = await session.status(jar)
      if (state === "expired") clock.set(3_600_000)
      else await session.logout(jar)
      await expect(session.verifyCsrf(jar, csrfToken)).rejects.toMatchObject({
        kind: "auth/unauthenticated",
      })
    },
  )

  test("a committed logout defeats a login begun with the prior generation", async () => {
    const { session } = setup()
    const jar = await login(session)
    jar.commit()
    await session.beginLogin(jar)
    jar.commit()
    await session.logout(jar)
    await expect(session.completeLogin(jar, { params: {} })).rejects.toMatchObject({
      kind: "auth/session-revoked",
    })
    expect(jar.entries.filter((entry) => entry.startsWith("__Host-session="))).toHaveLength(1)
  })

  test("a stale revoked cookie can recover through a new strongly verified login", async () => {
    const { session } = setup()
    const jar = await login(session)
    jar.commit()
    await session.logout(jar)
    // A lost logout response leaves the old browser cookie. Login revokes its family again.
    jar.entries.splice(0)
    await login(session, jar)
    jar.commit()
    expect(await session.read(jar)).toEqual({ subject: "ada" })
  })

  test("a login begun before absolute expiry cannot renew the expired family", async () => {
    const { session, clock } = setup()
    const jar = await login(session)
    jar.commit()
    clock.set(3_599_000)
    await session.beginLogin(jar)
    jar.commit()
    clock.set(3_600_000)
    await expect(session.completeLogin(jar, { params: {} })).rejects.toMatchObject({
      kind: "auth/session-revoked",
    })
    expect(jar.entries.some((entry) => entry.startsWith("__Host-session="))).toBe(false)
    expect(await session.read(jar)).toBeUndefined()
  })

  test("a login begun after expiry establishes a new family", async () => {
    const { session, clock } = setup()
    const jar = await login(session)
    jar.commit()
    clock.set(3_600_000)
    await login(session, jar)
    jar.commit()
    expect((await session.status(jar)).expiresAt).toBe("1970-01-01T02:00:00.000Z")
  })

  test("old-generation logout revokes a replacement and absolute expiry does not slide", async () => {
    const { session, clock } = setup()
    const jar = await login(session)
    jar.commit()
    const old = jar.get("__Host-session")
    clock.set(1000)
    await login(session, jar)
    jar.commit()
    expect((await session.status(jar)).expiresAt).toBe("1970-01-01T01:00:00.000Z")
    const oldJar = browserJar()
    oldJar.set(`__Host-session=${old}; Secure`)
    oldJar.commit()
    await session.logout(oldJar)
    expect(await session.read(jar)).toBeUndefined()
  })

  test("transaction verification, guard config and adapter capability failures are explicit", async () => {
    const { session, config } = setup()
    const jar = browserJar()
    await expect(session.completeLogin(jar, { params: {} })).rejects.toMatchObject({
      kind: "auth/login-transaction",
    })
    jar.set("__Host-login_tx=forged.value; Secure")
    jar.commit()
    await expect(session.completeLogin(jar, { params: {} })).rejects.toThrow()
    const noInteractive = createServerSession({
      ...config,
      adapter: { id: "stateless", authenticate: async () => null },
    })
    await expect(noInteractive.beginLogin(jar)).rejects.toMatchObject({ kind: "auth/config" })
    await expect(noInteractive.completeLogin(jar, { params: {} })).rejects.toMatchObject({
      kind: "auth/config",
    })
    expect(() => createServerSession({ ...config, ttlSeconds: 3601 })).toThrow()
    expect(() => createServerSession({ ...config, transactionTtlSeconds: 0 })).toThrow()
  })

  test("a family revoked while provider refresh is held publishes no credentials", async () => {
    const { config, memory } = setup()
    const entered = deferred<void>()
    const release = deferred<void>()
    const session = createServerSession({
      ...config,
      adapter: {
        ...config.adapter,
        async refresh() {
          entered.resolve()
          await release.promise
          return { accessToken: "late-credential", expiresAt: 2000 }
        },
      },
    })
    const jar = await login(session)
    jar.commit()
    const refreshed = session.refreshProvider(jar)
    await entered.promise
    // Another request committed the family revocation; its provider release has not run yet.
    const credential = jar.get("__Host-session") ?? ""
    const reference = base64urlEncode(
      await defaultAuthCrypto().digestSha256(new TextEncoder().encode(`session.${credential}`)),
    )
    await memory.revoke(reference)
    release.resolve()
    await expect(refreshed).rejects.toMatchObject({ kind: "auth/session-revoked" })
  })

  test("logout releases every provider handle in the family even when one release fails", async () => {
    const { config } = setup()
    let minted = 0
    const released: string[] = []
    const session = createServerSession({
      ...config,
      adapter: {
        ...config.adapter,
        completeLogin: async () => ({
          identity: { subject: "ada", claims: {} },
          tokens: { accessToken: "server-only", expiresAt: 1000 },
          sessionHandle: `provider-slot-${++minted}`,
        }),
        async logout({ sessionHandle }) {
          released.push(sessionHandle)
          if (sessionHandle === "provider-slot-1") {
            throw new AuthError("auth/store-unavailable", "provider custody down")
          }
        },
      },
    })
    const jar = await login(session)
    jar.commit()
    await login(session, jar)
    jar.commit()
    await expect(session.logout(jar)).rejects.toMatchObject({ kind: "auth/store-unavailable" })
    expect(released.sort()).toEqual(["provider-slot-1", "provider-slot-2"])
    expect(await session.read(jar)).toBeUndefined()
  })

  test("compromised provider refresh revokes the opaque family and propagates", async () => {
    const { config } = setup()
    const refresh = vi.fn(async (_request: { readonly signal?: WebAbortSignal }) => {
      throw new AuthError("auth/session-revoked", "provider compromise")
    })
    const logout = vi.fn<NonNullable<AuthAdapter["logout"]>>(async () => {})
    const session = createServerSession({
      ...config,
      adapter: { ...config.adapter, refresh, logout },
    })
    const jar = await login(session)
    jar.commit()
    await expect(session.refreshProvider(jar)).rejects.toMatchObject({
      kind: "auth/session-revoked",
    })
    expect(await session.read(jar)).toBeUndefined()
    expect(logout.mock.calls.map(([request]) => request.sessionHandle)).toEqual(["provider-slot"])
  })
})
