import { describe, expect, it } from "vitest"
import { safeMarkdownUrl } from "./url"

describe("safeMarkdownUrl", () => {
  it.each(["https://example.com/a?b=c", "http://example.com", "mailto:someone@example.com"])(
    "keeps %s",
    (url) => {
      expect(safeMarkdownUrl(url)).toBe(url)
    },
  )

  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    " javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox",
    "file:///etc/passwd",
    "/admin",
    "../x",
    "#top",
    "",
  ])("refuses %j", (url) => {
    expect(safeMarkdownUrl(url)).toBeUndefined()
  })
})
