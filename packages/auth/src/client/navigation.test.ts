// The DOM-free login/logout actions, driven through a fake navigator so they run under the default
// `node` environment exactly as they would on React Native.
import { describe, expect, test, vi } from "vitest"
import { AuthError } from "../errors"
import { type AuthNavigator, login, logout } from "./navigation"

function fakeNavigator(overrides: Partial<AuthNavigator> = {}): AuthNavigator {
  return {
    navigate: vi.fn(),
    submit: vi.fn(),
    currentPath: () => "/",
    csrfToken: () => undefined,
    ...overrides,
  }
}

describe("login", () => {
  test("defaults the return target to the navigator's current path", () => {
    const navigator = fakeNavigator({ currentPath: () => "/tasks?page=2#top" })
    login({ navigator })
    expect(navigator.navigate).toHaveBeenCalledWith(
      `/login?returnTo=${encodeURIComponent("/tasks?page=2#top")}`,
    )
  })

  test("honors a custom login path and return parameter", () => {
    const navigator = fakeNavigator()
    login({ navigator, loginPath: "/signin", returnTo: "/settings", returnToParam: "next" })
    expect(navigator.navigate).toHaveBeenCalledWith(
      `/signin?next=${encodeURIComponent("/settings")}`,
    )
  })

  test("sanitizes an off-origin return target back to root", () => {
    const navigator = fakeNavigator()
    login({ navigator, returnTo: "https://evil.test/steal" })
    expect(navigator.navigate).toHaveBeenCalledWith(`/login?returnTo=${encodeURIComponent("/")}`)
  })

  test("sanitizes an off-origin login path back to the default route", () => {
    const navigator = fakeNavigator()
    login({ navigator, loginPath: "//evil.test/login", returnTo: "/tasks" })
    expect(navigator.navigate).toHaveBeenCalledWith(
      `/login?returnTo=${encodeURIComponent("/tasks")}`,
    )
  })

  test("preserves query parameters and the fragment on loginPath", () => {
    const navigator = fakeNavigator()
    login({ navigator, loginPath: "/signin?tenant=acme#section", returnTo: "/tasks" })
    expect(navigator.navigate).toHaveBeenCalledWith(
      `/signin?tenant=acme&returnTo=${encodeURIComponent("/tasks")}#section`,
    )
  })

  test("escapes custom parameter names", () => {
    const navigator = fakeNavigator()
    login({ navigator, returnToParam: "return to", returnTo: "/tasks" })
    expect(navigator.navigate).toHaveBeenCalledWith(
      `/login?return+to=${encodeURIComponent("/tasks")}`,
    )
  })
})

describe("logout", () => {
  test("submits to the default logout route carrying the navigator's CSRF token", () => {
    const navigator = fakeNavigator({ csrfToken: () => "csrf-token-123" })
    logout({ navigator })
    expect(navigator.submit).toHaveBeenCalledWith("/logout", { csrf: "csrf-token-123" })
  })

  test("an explicit csrfToken and custom path win over the navigator", () => {
    const navigator = fakeNavigator({ csrfToken: () => "cookie-token" })
    logout({ navigator, logoutPath: "/sign-out", csrfToken: "explicit-token" })
    expect(navigator.submit).toHaveBeenCalledWith("/sign-out", { csrf: "explicit-token" })
  })

  test("submits an empty token when none is known, leaving the server to reject it", () => {
    const navigator = fakeNavigator()
    logout({ navigator })
    expect(navigator.submit).toHaveBeenCalledWith("/logout", { csrf: "" })
  })
})

describe("a missing navigator", () => {
  test("login and logout fail with a typed config error", () => {
    const untyped = {} as { navigator: AuthNavigator }
    expect(() => login(untyped)).toThrow(AuthError)
    expect(() => logout(untyped)).toThrow(expect.objectContaining({ kind: "auth/config" }))
  })
})
