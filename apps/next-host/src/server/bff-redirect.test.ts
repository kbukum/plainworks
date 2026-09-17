import { describe, expect, it } from "vitest"
import { redirectWithCookies } from "./bff-redirect"

// Proves the BFF redirect builds a 303 response against the configured host origin and carries
// every buffered Set-Cookie header forward.

describe("redirectWithCookies", () => {
  it("resolves a relative path against the configured host origin", () => {
    const response = redirectWithCookies("/tasks", ["session=123; Path=/"])
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("http://localhost:3000/tasks")
    expect(response.headers.get("set-cookie")).toContain("session=123")
  })

  it("preserves an absolute redirect URL", () => {
    const response = redirectWithCookies("https://auth.example.com/callback", [])
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("https://auth.example.com/callback")
  })
})
