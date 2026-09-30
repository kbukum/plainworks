import { describe, expect, it } from "vitest"
import { isAuthErrorKind } from "../../errors"
import { redirectToPath, redirectToUrl } from "./redirect"

// Redirects answer a BFF route with `303 See Other`, so the follow-up is always a GET, and carry
// every buffered `Set-Cookie`. A path redirect never leaves the app origin.

const origin = "https://app.test"

describe("redirectToPath", () => {
  it("resolves a same-origin path against the app origin", () => {
    const response = redirectToPath({ origin, path: "/tasks?page=2#top" })
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("https://app.test/tasks?page=2#top")
  })

  it.each([
    "https://evil.test/",
    "//evil.test/",
    "/\\evil.test",
    "\\\\evil.test",
    "javascript:alert(1)",
    "/\ttab",
    "",
  ])("never redirects off-origin for %j", (path) => {
    const response = redirectToPath({ origin, path })
    expect(response.headers.get("location")).toBe("https://app.test/")
  })

  it("uses the fallback path when the target is unsafe", () => {
    const response = redirectToPath({ origin, path: "//evil.test", fallback: "/login" })
    expect(response.headers.get("location")).toBe("https://app.test/login")
  })

  it("appends every buffered cookie as its own Set-Cookie header", () => {
    const response = redirectToPath({ origin, path: "/", cookies: ["a=1", "b=2"] })
    expect(response.headers.get("set-cookie")).toBe("a=1, b=2")
    expect([...response.headers].filter(([name]) => name === "set-cookie")).toHaveLength(2)
  })

  it("rejects an origin that is not an absolute http(s) origin", () => {
    expect(() => redirectToPath({ origin: "/relative", path: "/" })).toThrow()
  })
})

describe("redirectToUrl", () => {
  it("redirects to a trusted absolute URL with the cookies", () => {
    const response = redirectToUrl("https://idp.test/authorize?state=x", ["txn=1"])
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("https://idp.test/authorize?state=x")
    expect(response.headers.get("set-cookie")).toBe("txn=1")
  })

  it.each(["/relative", "javascript:alert(1)", "data:text/html,x", "not a url"])(
    "rejects %j as a typed config error",
    (url) => {
      let caught: unknown
      try {
        redirectToUrl(url)
      } catch (error) {
        caught = error
      }
      expect(isAuthErrorKind(caught, "auth/config")).toBe(true)
    },
  )
})
