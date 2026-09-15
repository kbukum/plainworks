// @vitest-environment jsdom
// The browser navigation paths: `location`-derived return target and the default `location.assign`.
import { afterEach, describe, expect, test, vi } from "vitest"
import { login, logout } from "./navigation"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, "", "/")
})

describe("login (browser)", () => {
  test("defaults the return target to the current location", () => {
    window.history.replaceState(null, "", "/tasks?page=2#top")
    const navigate = vi.fn()
    login({ navigate })
    expect(navigate).toHaveBeenCalledWith(
      `/login?returnTo=${encodeURIComponent("/tasks?page=2#top")}`,
    )
  })

  test("uses the default browser navigator when none is injected", () => {
    const assign = vi.fn()
    vi.stubGlobal("location", { pathname: "/dashboard", search: "", hash: "", assign })
    login()
    expect(assign).toHaveBeenCalledWith(`/login?returnTo=${encodeURIComponent("/dashboard")}`)
  })

  test("honors a custom login path and return parameter", () => {
    const navigate = vi.fn()
    login({ navigate, loginPath: "/signin", returnTo: "/settings", returnToParam: "next" })
    expect(navigate).toHaveBeenCalledWith(`/signin?next=${encodeURIComponent("/settings")}`)
  })

  test("sanitizes an off-origin return target back to root", () => {
    const navigate = vi.fn()
    login({ navigate, returnTo: "https://evil.test/steal" })
    expect(navigate).toHaveBeenCalledWith(`/login?returnTo=${encodeURIComponent("/")}`)
  })

  test("preserves existing query parameters on loginPath", () => {
    const navigate = vi.fn()
    login({ navigate, loginPath: "/signin?tenant=acme", returnTo: "/tasks" })
    expect(navigate).toHaveBeenCalledWith(
      `/signin?tenant=acme&returnTo=${encodeURIComponent("/tasks")}`,
    )
  })

  test("preserves hash fragment on loginPath after query parameters", () => {
    const navigate = vi.fn()
    login({ navigate, loginPath: "/signin#section", returnTo: "/tasks" })
    expect(navigate).toHaveBeenCalledWith(
      `/signin?returnTo=${encodeURIComponent("/tasks")}#section`,
    )
  })

  test("preserves both query parameters and fragment on loginPath", () => {
    const navigate = vi.fn()
    login({ navigate, loginPath: "/signin?tenant=acme#section", returnTo: "/tasks" })
    expect(navigate).toHaveBeenCalledWith(
      `/signin?tenant=acme&returnTo=${encodeURIComponent("/tasks")}#section`,
    )
  })

  test("escapes custom parameter names properly", () => {
    const navigate = vi.fn()
    login({ navigate, returnToParam: "return to", returnTo: "/tasks" })
    expect(navigate).toHaveBeenCalledWith(`/login?return+to=${encodeURIComponent("/tasks")}`)
  })
})

describe("logout (browser)", () => {
  test("submits to the default logout route carrying CSRF from cookie", () => {
    Object.defineProperty(document, "cookie", {
      value: "__Host-csrf=csrf-token-123",
      configurable: true,
      writable: true,
    })
    const submit = vi.fn()
    logout({ submit })
    expect(submit).toHaveBeenCalledWith("/logout", { csrf: "csrf-token-123" })
  })

  test("honors explicit csrfToken override and custom path", () => {
    const submit = vi.fn()
    logout({ submit, logoutPath: "/sign-out", csrfToken: "explicit-token" })
    expect(submit).toHaveBeenCalledWith("/sign-out", { csrf: "explicit-token" })
  })

  test("safely reads cookie names containing metacharacters without regex errors", () => {
    Object.defineProperty(document, "cookie", {
      value: "csrf[custom]=token-brackets",
      configurable: true,
      writable: true,
    })
    const submit = vi.fn()
    logout({ submit, csrfCookieName: "csrf[custom]" })
    expect(submit).toHaveBeenCalledWith("/logout", { csrf: "token-brackets" })
  })

  test("uses default browser form submission when no submit seam is injected", () => {
    Object.defineProperty(document, "cookie", {
      value: "__Host-csrf=token-abc",
      configurable: true,
      writable: true,
    })
    let submittedMethod = ""
    let submittedAction = ""
    let submittedInputName = ""
    let submittedInputValue = ""
    const submitSpy = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function (
      this: HTMLFormElement,
    ) {
      submittedMethod = this.method
      submittedAction = this.getAttribute("action") ?? ""
      const input = this.querySelector<HTMLInputElement>("input[type='hidden']")
      if (input) {
        submittedInputName = input.name
        submittedInputValue = input.value
      }
    })

    logout({ logoutPath: "/logout" })
    expect(submitSpy).toHaveBeenCalled()
    expect(submittedMethod.toUpperCase()).toBe("POST")
    expect(submittedAction).toBe("/logout")
    expect(submittedInputName).toBe("csrf")
    expect(submittedInputValue).toBe("token-abc")
  })
})
