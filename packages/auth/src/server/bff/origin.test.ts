import { describe, expect, it } from "vitest"
import { isAuthErrorKind } from "../../errors"
import { isSameOriginRequest, parseAppOrigin } from "./origin"

// A state-changing BFF route runs only for a request the app's own pages sent. Fetch Metadata is
// the primary signal, then `Origin`, then `Referer`; a request with none of them is denied.

const origin = "https://app.test"

function request(headers: Record<string, string>) {
  return { headers: new Headers(headers) }
}

describe("parseAppOrigin", () => {
  it("normalizes an absolute http(s) URL to its origin", () => {
    expect(parseAppOrigin("https://app.test/some/path?q=1")).toBe("https://app.test")
    expect(parseAppOrigin("http://localhost:3000")).toBe("http://localhost:3000")
  })

  it.each(["", "app.test", "/path", "ftp://app.test", "javascript:alert(1)"])(
    "rejects %j as a typed config error",
    (value) => {
      let caught: unknown
      try {
        parseAppOrigin(value)
      } catch (error) {
        caught = error
      }
      expect(isAuthErrorKind(caught, "auth/config")).toBe(true)
    },
  )
})

describe("isSameOriginRequest", () => {
  it("accepts Sec-Fetch-Site: same-origin", () => {
    expect(isSameOriginRequest(request({ "sec-fetch-site": "same-origin" }), origin)).toBe(true)
  })

  it.each(["cross-site", "same-site", "none"])("denies Sec-Fetch-Site: %s", (site) => {
    // Fetch Metadata wins even when a forged Origin claims the app.
    const headers = { "sec-fetch-site": site, origin }
    expect(isSameOriginRequest(request(headers), origin)).toBe(false)
  })

  it("falls back to a matching Origin header", () => {
    expect(isSameOriginRequest(request({ origin }), origin)).toBe(true)
  })

  it("denies a mismatched Origin header", () => {
    expect(isSameOriginRequest(request({ origin: "https://evil.test" }), origin)).toBe(false)
    expect(isSameOriginRequest(request({ origin: "https://app.test:8443" }), origin)).toBe(false)
    expect(isSameOriginRequest(request({ origin: "null" }), origin)).toBe(false)
  })

  it("falls back to the Referer origin", () => {
    const same = request({ referer: "https://app.test/settings?tab=1" })
    const cross = request({ referer: "https://evil.test/app.test" })
    expect(isSameOriginRequest(same, origin)).toBe(true)
    expect(isSameOriginRequest(cross, origin)).toBe(false)
    expect(isSameOriginRequest(request({ referer: "not a url" }), origin)).toBe(false)
  })

  it("denies a request with no provenance headers", () => {
    expect(isSameOriginRequest(request({}), origin)).toBe(false)
  })

  it("compares against the normalized app origin", () => {
    expect(isSameOriginRequest(request({ origin }), "https://app.test/base")).toBe(true)
  })
})
