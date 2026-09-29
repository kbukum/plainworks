import { describe, expect, test } from "vitest"
import {
  type CookieAttributes,
  isCookieNameToken,
  isCookiePath,
  MAX_COOKIE_BYTES,
  parseCookieHeader,
  readCookie,
  serializeCookieAttributes,
} from "./cookie"

describe("cookie name token", () => {
  test("accepts RFC 6265 tokens", () => {
    expect(isCookieNameToken("theme")).toBe(true)
    expect(isCookieNameToken("__Host-session")).toBe(true)
    expect(isCookieNameToken("a.b_c-d")).toBe(true)
  })

  test("rejects controls, spaces, and separators", () => {
    expect(isCookieNameToken("has space")).toBe(false)
    expect(isCookieNameToken("has;semicolon")).toBe(false)
    expect(isCookieNameToken("has=equals")).toBe(false)
    expect(isCookieNameToken("")).toBe(false)
  })
})

describe("cookie path", () => {
  test("accepts absolute paths", () => {
    expect(isCookiePath("/")).toBe(true)
    expect(isCookiePath("/app/inner")).toBe(true)
  })

  test("rejects relative paths and grammar breakers", () => {
    expect(isCookiePath("app")).toBe(false)
    expect(isCookiePath("/has space")).toBe(false)
    expect(isCookiePath("/has;semi")).toBe(false)
    expect(isCookiePath("/has,comma")).toBe(false)
  })
})

describe("serialize cookie attributes", () => {
  test("defaults to Path=/ and SameSite=Lax", () => {
    expect(serializeCookieAttributes()).toBe("Path=/; SameSite=Lax")
  })

  test("emits attributes in a fixed order", () => {
    const attributes: CookieAttributes = {
      path: "/app",
      sameSite: "Strict",
      maxAgeSeconds: 3600,
      secure: true,
      httpOnly: true,
    }
    expect(serializeCookieAttributes(attributes)).toBe(
      "Path=/app; SameSite=Strict; Max-Age=3600; Secure; HttpOnly",
    )
  })

  test("forces Secure for SameSite=None even when secure is unset", () => {
    expect(serializeCookieAttributes({ sameSite: "None" })).toBe("Path=/; SameSite=None; Secure")
  })

  test("omits Max-Age for a session cookie", () => {
    expect(serializeCookieAttributes({ secure: true })).toBe("Path=/; SameSite=Lax; Secure")
  })
})

describe("cookie byte budget", () => {
  test("exposes the ~4KB per-cookie limit", () => {
    expect(MAX_COOKIE_BYTES).toBe(4096)
  })
})

describe("parse cookie header", () => {
  test("splits a multi-cookie header into a name→value map", () => {
    const jar = parseCookieHeader("theme=dark; session=abc; lang=en")
    expect(jar.get("theme")).toBe("dark")
    expect(jar.get("session")).toBe("abc")
    expect(jar.get("lang")).toBe("en")
  })

  test("returns values still percent-encoded, leaving decoding to the caller", () => {
    expect(parseCookieHeader("theme=%7B%22mode%22%3A%22dark%22%7D").get("theme")).toBe(
      "%7B%22mode%22%3A%22dark%22%7D",
    )
  })

  test("keeps `=` inside a value intact", () => {
    expect(parseCookieHeader("token=a=b=c").get("token")).toBe("a=b=c")
  })

  test("skips malformed pairs and keeps the first occurrence of a name", () => {
    const jar = parseCookieHeader("; novalue; =novalue; theme=first; theme=second")
    expect(jar.get("theme")).toBe("first")
    expect(jar.has("novalue")).toBe(false)
    expect(jar.size).toBe(1)
  })

  test("returns an empty map for an empty header", () => {
    expect(parseCookieHeader("").size).toBe(0)
  })
})

describe("read cookie", () => {
  test("returns one cookie's raw value", () => {
    expect(readCookie("theme=dark; session=abc%20d", "session")).toBe("abc%20d")
  })

  test("returns undefined when the cookie is absent or the header is empty", () => {
    expect(readCookie("theme=dark", "session")).toBeUndefined()
    expect(readCookie("", "session")).toBeUndefined()
  })

  test("never matches a name that is only a prefix of another", () => {
    expect(readCookie("session_old=stale; session=fresh", "session")).toBe("fresh")
    expect(readCookie("session_old=stale", "session")).toBeUndefined()
  })

  test("keeps the first occurrence of a duplicated name", () => {
    expect(readCookie("theme=first; theme=second", "theme")).toBe("first")
  })
})
