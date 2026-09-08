import type { StandardSchemaV1, StateSource } from "@plainworks/std"
import { manualClock } from "@plainworks/testkit"
import { describe, expect, test } from "vitest"
import { AuthError } from "../errors"
import type { SessionSigner } from "../signer/seam"
import { createCookieSessionStore, type SessionCookieJar } from "./cookie-store"

const fakeSigner: SessionSigner = {
  sign: async (message) => `sig-${message}`,
  verify: async (message, signature) => signature === `sig-${message}`,
}

const sessionSchema: StandardSchemaV1<unknown, { sub: string }> = {
  "~standard": {
    version: 1,
    vendor: "auth-test",
    validate: (value) =>
      typeof value === "object" &&
      value !== null &&
      "sub" in value &&
      typeof (value as { sub?: unknown }).sub === "string"
        ? { value: value as { sub: string } }
        : { issues: [{ message: "expected { sub: string }" }] },
  },
}

// A single-request cookie jar: `set` parses `name=value; attrs` so a written cookie reads back
// through `get` (empty value = cleared), and every raw `Set-Cookie` string is retained for
// assertion.
function fakeJar(): { jar: SessionCookieJar; setCookies: string[] } {
  const store = new Map<string, string>()
  const setCookies: string[] = []
  return {
    setCookies,
    jar: {
      get: (name) => store.get(name),
      set: (setCookie) => {
        setCookies.push(setCookie)
        const eq = setCookie.indexOf("=")
        const semi = setCookie.indexOf(";")
        const name = setCookie.slice(0, eq)
        const value = setCookie.slice(eq + 1, semi === -1 ? undefined : semi)
        if (value === "") {
          store.delete(name)
        } else {
          store.set(name, value)
        }
      },
    },
  }
}

function makeStore(
  jar: SessionCookieJar,
  overrides: { cookieName?: string; ttlSeconds?: number } = {},
): StateSource<{ sub: string }> {
  return createCookieSessionStore({
    jar,
    signer: fakeSigner,
    schema: sessionSchema,
    clock: manualClock(1_700_000_000_000),
    ttlSeconds: overrides.ttlSeconds ?? 3600,
    ...(overrides.cookieName === undefined ? {} : { cookieName: overrides.cookieName }),
  })
}

describe("createCookieSessionStore configuration", () => {
  test("rejects a cookie name that is not an RFC 6265 token", () => {
    expect(() => makeStore(fakeJar().jar, { cookieName: "bad name" })).toThrow(AuthError)
    try {
      makeStore(fakeJar().jar, { cookieName: "bad name" })
      expect.unreachable("expected an AuthError")
    } catch (error) {
      expect(error).toMatchObject({ kind: "auth/config" })
    }
  })

  test("rejects a ttlSeconds that is not a positive integer → auth/config", () => {
    for (const ttlSeconds of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => makeStore(fakeJar().jar, { ttlSeconds })).toThrow(AuthError)
    }
  })
})

describe("createCookieSessionStore.set", () => {
  test("writes the exact __Host- cookie with the mandated attributes", async () => {
    const { jar, setCookies } = fakeJar()
    await makeStore(jar).set({ sub: "user-1" })
    expect(setCookies).toHaveLength(1)
    expect(setCookies[0]).toMatch(
      /^__Host-session=[A-Za-z0-9_-]+\.sig-[A-Za-z0-9_-]+; Path=\/; SameSite=Strict; Max-Age=3600; Secure; HttpOnly$/,
    )
  })

  test("refuses a value that would exceed the cookie byte budget → auth/config", async () => {
    const { jar } = fakeJar()
    const oversized = { sub: "x".repeat(5000) }
    await expect(makeStore(jar).set(oversized)).rejects.toMatchObject({ kind: "auth/config" })
  })
})

describe("createCookieSessionStore.get", () => {
  test("round-trips a written session through the jar", async () => {
    const { jar } = fakeJar()
    const store = makeStore(jar)
    await store.set({ sub: "user-1" })
    await expect(store.get()).resolves.toEqual({ sub: "user-1" })
  })

  test("returns undefined when no cookie is present", async () => {
    await expect(makeStore(fakeJar().jar).get()).resolves.toBeUndefined()
  })

  test("throws session-invalid for a tampered cookie, never a fabricated session", async () => {
    const { jar } = fakeJar()
    jar.set("__Host-session=forged.sig-wrong; Path=/")
    await expect(makeStore(jar).get()).rejects.toMatchObject({ kind: "auth/session-invalid" })
  })
})

describe("createCookieSessionStore.remove", () => {
  test("clears the cookie with Max-Age=0", async () => {
    const { jar, setCookies } = fakeJar()
    const store = makeStore(jar)
    await store.set({ sub: "user-1" })
    await store.remove()
    expect(setCookies.at(-1)).toBe(
      "__Host-session=; Path=/; SameSite=Strict; Max-Age=0; Secure; HttpOnly",
    )
    await expect(store.get()).resolves.toBeUndefined()
  })
})

describe("createCookieSessionStore.subscribe", () => {
  test("notifies subscribers on set and remove, and stops after unsubscribe", async () => {
    const { jar } = fakeJar()
    const store = makeStore(jar)
    let notifications = 0
    const subscription = store.subscribe(() => {
      notifications++
    })
    await store.set({ sub: "user-1" })
    await store.remove()
    expect(notifications).toBe(2)
    subscription.unsubscribe()
    await store.set({ sub: "user-2" })
    expect(notifications).toBe(2)
  })
})
