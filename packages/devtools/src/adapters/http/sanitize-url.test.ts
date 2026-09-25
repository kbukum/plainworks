import { describe, expect, it } from "vitest"
import { sanitizeHttpUrl } from "./sanitize-url"

describe("sanitizeHttpUrl", () => {
  it("keeps scheme, host, and path", () => {
    expect(sanitizeHttpUrl("https://api.test/tasks/42")).toBe("https://api.test/tasks/42")
  })

  it("strips userinfo credentials", () => {
    expect(sanitizeHttpUrl("https://user:secret@api.test/tasks")).toBe("https://api.test/tasks")
  })

  it("strips the query string, which can smuggle a token", () => {
    expect(sanitizeHttpUrl("https://api.test/tasks?access_token=abc&page=2")).toBe(
      "https://api.test/tasks",
    )
  })

  it("strips the fragment", () => {
    expect(sanitizeHttpUrl("https://api.test/tasks#section")).toBe("https://api.test/tasks")
  })

  it("reduces an unparsable value to a fixed placeholder rather than echoing it", () => {
    expect(sanitizeHttpUrl("not a url")).toBe("[unparsable-url]")
  })

  it.each(["data:text/plain,secret-payload", "javascript:secret-payload", "file:///secret"])(
    "reduces the non-HTTP URL %s to a fixed placeholder",
    (url) => {
      expect(sanitizeHttpUrl(url)).toBe("[unsupported-url]")
    },
  )

  describe('scope "path"', () => {
    it("drops the origin and keeps the path", () => {
      expect(sanitizeHttpUrl("https://api.test/tasks/42", "path")).toBe("/tasks/42")
    })

    it("still strips credentials, query, and fragment", () => {
      const userinfo = "user:secret@"
      expect(sanitizeHttpUrl(`https://${userinfo}api.test/t?access_token=abc#x`, "path")).toBe("/t")
    })

    it("uses the same placeholders for unusable values", () => {
      expect(sanitizeHttpUrl("not a url", "path")).toBe("[unparsable-url]")
      expect(sanitizeHttpUrl("file:///secret", "path")).toBe("[unsupported-url]")
    })
  })
})
