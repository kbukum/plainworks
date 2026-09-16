// The off-DOM paths run under the package's default `node` environment (no `location`): the return
// target falls back to root, and the default browser navigator refuses to run, so a React
// Native/Expo host must inject its own `navigate`.
import { describe, expect, test, vi } from "vitest"
import { login, logout } from "./navigation"

describe("navigation off the DOM", () => {
  test("falls back to a root return target when there is no location", () => {
    const navigate = vi.fn()
    login({ navigate })
    expect(navigate).toHaveBeenCalledWith(`/login?returnTo=${encodeURIComponent("/")}`)
  })

  test("the default navigator throws off the DOM, demanding an injected navigate", () => {
    expect(() => login()).toThrow(/browser `location`/)
    expect(() => logout()).toThrow(/browser `document`/)
  })

  test("still submits when a submit handler is injected", () => {
    const submit = vi.fn()
    logout({ submit })
    expect(submit).toHaveBeenCalledWith("/logout", { csrf: "" })
  })
})
