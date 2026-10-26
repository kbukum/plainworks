// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { applyTextScale } from "./page-session"

describe("text scale under a host CSP", () => {
  it("uses the host nonce before inserting the style and removes only its own style", () => {
    const host = document.createElement("script")
    host.nonce = "test-host-nonce"
    document.head.append(host)
    const style = applyTextScale(2)
    expect(style.nonce).toBe("test-host-nonce")
    expect(style.textContent).toBe("html { font-size: 200% !important; }")
    expect(style.parentNode).toBe(document.head)
    style.remove()
    expect(host.parentNode).toBe(document.head)
    host.remove()
  })

  it("works for a host with no nonce", () => {
    const style = applyTextScale(2)
    expect(style.nonce).toBe("")
    style.remove()
  })
})
