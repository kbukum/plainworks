// @vitest-environment jsdom
// The browser navigator: `location`-driven navigation, a hidden-form POST, and the `__Host-` CSRF
// cookie read, all against jsdom.
import { afterEach, describe, expect, test, vi } from "vitest"
import { login, logout } from "../client/navigation"
import { createFormPostNavigator, formPostNavigator } from "./form-post"

function setCookie(value: string): void {
  Object.defineProperty(document, "cookie", { value, configurable: true, writable: true })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setCookie("")
  window.history.replaceState(null, "", "/")
})

describe("formPostNavigator", () => {
  test("reports the current path, search, and hash", () => {
    window.history.replaceState(null, "", "/tasks?page=2#top")
    expect(formPostNavigator.currentPath()).toBe("/tasks?page=2#top")
  })

  test("navigates with a full-page location.assign", () => {
    const assign = vi.fn()
    vi.stubGlobal("location", { pathname: "/dashboard", search: "", hash: "", assign })
    login({ navigator: formPostNavigator })
    expect(assign).toHaveBeenCalledWith(`/login?returnTo=${encodeURIComponent("/dashboard")}`)
  })

  test("reads the CSRF token from the __Host-csrf cookie, decoding it", () => {
    setCookie("other=1; __Host-csrf=token%20abc")
    expect(formPostNavigator.csrfToken()).toBe("token abc")
  })

  test("keeps a cookie value that is not valid percent-encoding as-is", () => {
    setCookie("__Host-csrf=%E0%A4%A")
    expect(formPostNavigator.csrfToken()).toBe("%E0%A4%A")
  })

  test("returns no token when the cookie is absent", () => {
    expect(formPostNavigator.csrfToken()).toBeUndefined()
  })

  test("logout submits a hidden POST form carrying the CSRF token", () => {
    setCookie("__Host-csrf=token-abc")
    const seen: { method: string; action: string; fields: [string, string][] } = {
      method: "",
      action: "",
      fields: [],
    }
    vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function (
      this: HTMLFormElement,
    ) {
      seen.method = this.method
      seen.action = this.getAttribute("action") ?? ""
      seen.fields = [...this.querySelectorAll<HTMLInputElement>("input[type='hidden']")].map(
        (input) => [input.name, input.value],
      )
    })
    logout({ navigator: formPostNavigator })
    expect(seen).toEqual({ method: "post", action: "/logout", fields: [["csrf", "token-abc"]] })
  })
})

describe("createFormPostNavigator", () => {
  test("reads a custom CSRF cookie name, even one with metacharacters", () => {
    setCookie("csrf[custom]=token-brackets")
    expect(createFormPostNavigator({ csrfCookieName: "csrf[custom]" }).csrfToken()).toBe(
      "token-brackets",
    )
  })
})
