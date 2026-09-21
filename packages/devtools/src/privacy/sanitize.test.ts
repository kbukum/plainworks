import { describe, expect, it } from "vitest"
import { isJson, sanitize } from "./sanitize"

describe("sanitize", () => {
  it("returns primitives unchanged", () => {
    expect(sanitize("hello")).toBe("hello")
    expect(sanitize(42)).toBe(42)
    expect(sanitize(true)).toBe(true)
    expect(sanitize(null)).toBe(null)
  })

  it("coerces non-finite numbers to null", () => {
    expect(sanitize(Number.NaN)).toBe(null)
    expect(sanitize(Number.POSITIVE_INFINITY)).toBe(null)
  })

  it("masks sensitive keys via std redaction", () => {
    const result = sanitize({ authorization: "Bearer secret", user: "ada" }) as Record<
      string,
      unknown
    >
    expect(result.authorization).toBe("[REDACTED]")
    expect(result.user).toBe("ada")
  })

  it("keeps only whitelisted top-level keys", () => {
    const result = sanitize(
      { method: "GET", path: "/x", body: { huge: true } },
      { allow: ["method", "path"] },
    ) as Record<string, unknown>
    expect(result).toEqual({ method: "GET", path: "/x" })
  })

  it("breaks cycles into a marker", () => {
    const cyclic: Record<string, unknown> = { name: "root" }
    cyclic.self = cyclic
    const result = sanitize(cyclic) as Record<string, unknown>
    expect(result.name).toBe("root")
    expect(result.self).toBe("[Circular]")
  })

  it("truncates collections beyond maxItems and reports the overflow", () => {
    const result = sanitize([1, 2, 3, 4, 5], { maxItems: 2 }) as unknown[]
    expect(result.slice(0, 2)).toEqual([1, 2])
    expect(result[result.length - 1]).toBe("[+3 more]")
  })

  it("does not inspect collection entries beyond maxItems", () => {
    let invoked = false
    const value = [1, 2, 3]
    Object.defineProperty(value, 2, {
      enumerable: true,
      get() {
        invoked = true
        return "******"
      },
    })

    expect(sanitize(value, { maxItems: 2 })).toEqual([1, 2, "[+1 more]"])
    expect(invoked).toBe(false)
  })

  it("neutralizes functions and unsupported values", () => {
    const result = sanitize({ fn: () => 1, big: 10n, when: new Date(0) }) as Record<string, unknown>
    expect(result.fn).toBe("[Function]")
    expect(result.big).toBe("10")
    expect(result.when).toBe("1970-01-01T00:00:00.000Z")
  })

  it("replaces an oversized payload with a marker", () => {
    const big = { blob: "x".repeat(200) }
    expect(sanitize(big, { maxBytes: 32 })).toBe("[Truncated]")
  })

  it("caps traversal depth", () => {
    const deep = { a: { b: { c: { d: 1 } } } }
    const result = sanitize(deep, { maxDepth: 2 }) as Record<string, Record<string, unknown>>
    expect(result.a?.b).toBe("[Truncated]")
  })
})

describe("isJson", () => {
  it("accepts serializable trees", () => {
    expect(isJson({ a: [1, "two", null, { b: true }] })).toBe(true)
  })

  it("rejects functions, symbols, bigints, and non-finite numbers", () => {
    expect(isJson(() => 1)).toBe(false)
    expect(isJson(Symbol("x"))).toBe(false)
    expect(isJson(1n)).toBe(false)
    expect(isJson(Number.NaN)).toBe(false)
    expect(isJson(undefined)).toBe(false)
  })

  it("rejects class instances and cyclic structures", () => {
    expect(isJson(new Date())).toBe(false)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(isJson(cyclic)).toBe(false)
  })
})
