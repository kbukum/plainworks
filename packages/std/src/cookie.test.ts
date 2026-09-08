import { describe, expect, test } from "vitest"
import {
  type CookieAttributes,
  isCookieNameToken,
  isCookiePath,
  MAX_COOKIE_BYTES,
  serializeCookieAttributes,
  utf8ByteLength,
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

describe("utf8 byte length", () => {
  test("counts ASCII, 2-, 3-, and 4-byte code points like TextEncoder", () => {
    const encoder = new TextEncoder()
    for (const sample of ["theme", "café", "€uro", "😀 emoji", "a\u00e9\u20ac\u{1f600}z"]) {
      expect(utf8ByteLength(sample)).toBe(encoder.encode(sample).length)
    }
  })

  test("counts a lone surrogate as the 3-byte replacement, matching TextEncoder", () => {
    const encoder = new TextEncoder()
    for (const sample of ["\ud83d", "a\ud83dz", "\udc00", "\ud83d\ud83d"]) {
      expect(utf8ByteLength(sample)).toBe(encoder.encode(sample).length)
    }
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
