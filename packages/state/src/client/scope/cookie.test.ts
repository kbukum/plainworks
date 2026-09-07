// Default `node` environment: the cookie backend is driven through an injected jar, so no document
// is needed; the missing-host path is asserted separately.
import { describe, expect, test } from "vitest"
import { StateSourceError } from "../../errors"
import { stringSerializer } from "../../scope/serializer"
import { type CookieJar, cookieScope, createCookieScope } from "./cookie"

function fakeJar(): CookieJar & { readonly entries: string[] } {
  const store = new Map<string, string>()
  const entries: string[] = []
  return {
    entries,
    write(entry) {
      entries.push(entry)
      const [pair, ...attrs] = entry.split("; ")
      const eq = (pair ?? "").indexOf("=")
      const key = (pair ?? "").slice(0, eq)
      const value = (pair ?? "").slice(eq + 1)
      if (value === "" || attrs.includes("Max-Age=0")) {
        store.delete(key)
      } else {
        store.set(key, value)
      }
    },
    read: () => [...store.entries()].map(([key, value]) => `${key}=${value}`).join("; "),
  }
}

const spec = { key: "theme", serializer: stringSerializer }

describe("cookie scope backend", () => {
  test("is durable and sent to the server, so it signals non-secret-only use", () => {
    const source = createCookieScope({ jar: fakeJar() }).createSource(spec)
    expect(source.capabilities.sentToServer).toBe(true)
    expect(source.capabilities.durable).toBe(true)
    expect(source.capabilities.sharedAcrossTabs).toBe(false)
  })

  test("round-trips a value with URL encoding and clears it", async () => {
    const jar = fakeJar()
    const source = createCookieScope({ jar }).createSource(spec)
    expect(await source.get()).toBeUndefined()
    await source.set("a value/with=chars")
    expect(await source.get()).toBe("a value/with=chars")
    expect(jar.entries[0]).toContain("theme=a%20value%2Fwith%3Dchars")
    await source.remove()
    expect(await source.get()).toBeUndefined()
  })

  test("writes SameSite/Path/Secure attributes", async () => {
    const jar = fakeJar()
    const source = createCookieScope({
      jar,
      sameSite: "Strict",
      path: "/app",
      secure: true,
      maxAgeSeconds: 3600,
    }).createSource(spec)
    await source.set("dark")
    const entry = jar.entries[0]
    expect(entry).toContain("Path=/app")
    expect(entry).toContain("SameSite=Strict")
    expect(entry).toContain("Max-Age=3600")
    expect(entry).toContain("Secure")
  })

  test("forces Secure on SameSite=None even when secure is off", async () => {
    const jar = fakeJar()
    const source = createCookieScope({ jar, sameSite: "None", secure: false }).createSource(spec)
    await source.set("x")
    expect(jar.entries[0]).toContain("Secure")
  })

  test("refuses a write over the per-cookie size budget with a typed error", async () => {
    const source = createCookieScope({ jar: fakeJar() }).createSource(spec)
    await expect(source.set("x".repeat(5000))).rejects.toBeInstanceOf(StateSourceError)
  })

  test("measures the size budget in UTF-8 bytes, not UTF-16 code units", async () => {
    // A 3-byte-per-char value under the 4096 code-unit count but over the byte budget must be
    // refused — a code-unit check would wrongly let it through.
    const source = createCookieScope({ jar: fakeJar() }).createSource(spec)
    await expect(source.set("\u{1F600}".repeat(1200))).rejects.toThrow(/bytes, over/)
  })

  test("rejects a cookie name that is not a valid RFC 6265 token", () => {
    // A config error: caught when the source is built, not deferred to a write.
    expect(() =>
      createCookieScope({ jar: fakeJar() }).createSource({
        key: "bad name;drop",
        serializer: stringSerializer,
      }),
    ).toThrow(/valid RFC 6265 token/)
  })

  test("rejects an invalid cookie path when the source is built", () => {
    expect(() =>
      createCookieScope({ jar: fakeJar(), path: "no-slash" }).createSource(spec),
    ).toThrow(/path/)
  })

  test("the default host jar defers a typed document error to the first read", async () => {
    const source = cookieScope.createSource(spec) // construction is host-free (SSR-safe)
    await expect(source.get()).rejects.toThrow(StateSourceError)
    await expect(source.get()).rejects.toThrow(/document/)
  })
})
