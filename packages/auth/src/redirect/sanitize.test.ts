import { describe, expect, test } from "vitest"
import { sanitizeReturnTo } from "./sanitize"

describe("sanitizeReturnTo", () => {
  test("accepts a path-absolute same-origin reference verbatim", () => {
    expect(sanitizeReturnTo("/dashboard")).toBe("/dashboard")
    expect(sanitizeReturnTo("/tasks?page=2#top")).toBe("/tasks?page=2#top")
  })

  test("falls back for an empty or absent target", () => {
    expect(sanitizeReturnTo(undefined)).toBe("/")
    expect(sanitizeReturnTo("")).toBe("/")
    expect(sanitizeReturnTo(undefined, "/home")).toBe("/home")
  })

  test("rejects an absolute URL → fallback (open-redirect guard)", () => {
    expect(sanitizeReturnTo("https://evil.test/steal")).toBe("/")
    expect(sanitizeReturnTo("http://evil.test")).toBe("/")
  })

  test("rejects a scheme-relative URL → fallback", () => {
    expect(sanitizeReturnTo("//evil.test")).toBe("/")
  })

  test("rejects a backslash-obscured host reference → fallback", () => {
    expect(sanitizeReturnTo("/\\evil.test")).toBe("/")
    expect(sanitizeReturnTo("\\\\evil.test")).toBe("/")
  })

  test("rejects a target with control characters or whitespace → fallback", () => {
    expect(sanitizeReturnTo("/\tfoo")).toBe("/")
    expect(sanitizeReturnTo("/foo bar")).toBe("/")
    expect(sanitizeReturnTo("\n//evil.test")).toBe("/")
  })

  test("rejects a relative (non-slash) target → fallback", () => {
    expect(sanitizeReturnTo("dashboard")).toBe("/")
  })
})
