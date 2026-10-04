// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { login } from "../client/navigation"
import { createFormPostNavigator } from "./form-post"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test("OIDC login navigation never reads a credential or CSRF cookie", () => {
  const assign = vi.fn()
  vi.stubGlobal("location", { pathname: "/tasks", search: "?page=2", hash: "#top", assign })
  const navigator = createFormPostNavigator()
  expect(navigator.currentPath()).toBe("/tasks?page=2#top")
  login({ navigator })
  expect(assign).toHaveBeenCalledWith("/login?returnTo=%2Ftasks%3Fpage%3D2%23top")
})
