import { describe, expect, test } from "vitest"
import type { SessionSnapshot } from "../session"
import { guardSession, unauthenticatedRedirect } from "./guard"

const authed: SessionSnapshot = { status: "authenticated", identity: { subject: "u1", claims: {} } }
const anon: SessionSnapshot = { status: "unauthenticated", identity: null }

describe("unauthenticatedRedirect", () => {
  test("emits a same-origin login redirect carrying a sanitized returnTo", () => {
    const signal = unauthenticatedRedirect({ loginPath: "/login" }, "/tasks")
    expect(signal.reason).toBe("unauthenticated")
    expect(signal.to).toBe(`/login?returnTo=${encodeURIComponent("/tasks")}`)
  })

  test("sanitizes an off-origin returnTo before echoing it", () => {
    const signal = unauthenticatedRedirect({ loginPath: "/login" }, "https://evil.test")
    expect(signal.to).toBe(`/login?returnTo=${encodeURIComponent("/")}`)
  })

  test("honors a custom returnTo parameter name", () => {
    const signal = unauthenticatedRedirect({ loginPath: "/login", returnToParam: "next" }, "/a")
    expect(signal.to).toBe(`/login?next=${encodeURIComponent("/a")}`)
  })

  test("preserves existing query parameters on loginPath", () => {
    const signal = unauthenticatedRedirect({ loginPath: "/login?tenant=acme" }, "/tasks")
    expect(signal.to).toBe(`/login?tenant=acme&returnTo=${encodeURIComponent("/tasks")}`)
  })

  test("preserves hash fragment on loginPath after query parameters", () => {
    const signal = unauthenticatedRedirect({ loginPath: "/login#section" }, "/tasks")
    expect(signal.to).toBe(`/login?returnTo=${encodeURIComponent("/tasks")}#section`)
  })

  test("preserves both query parameters and fragment on loginPath", () => {
    const signal = unauthenticatedRedirect({ loginPath: "/login?tenant=acme#section" }, "/tasks")
    expect(signal.to).toBe(`/login?tenant=acme&returnTo=${encodeURIComponent("/tasks")}#section`)
  })

  test("escapes custom parameter names properly", () => {
    const signal = unauthenticatedRedirect(
      { loginPath: "/login", returnToParam: "return to" },
      "/tasks",
    )
    expect(signal.to).toBe(`/login?return+to=${encodeURIComponent("/tasks")}`)
  })
})

describe("guardSession", () => {
  test("returns null for an authenticated snapshot (route renders)", () => {
    expect(guardSession({ loginPath: "/login" }, authed, "/tasks")).toBeNull()
  })

  test("returns a login redirect for an unauthenticated snapshot", () => {
    const signal = guardSession({ loginPath: "/login" }, anon, "/tasks")
    expect(signal).toEqual({
      to: `/login?returnTo=${encodeURIComponent("/tasks")}`,
      reason: "unauthenticated",
    })
  })
})
