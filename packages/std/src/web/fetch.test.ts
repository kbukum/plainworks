import { afterEach, describe, expect, test, vi } from "vitest"
import { resolveFetch } from "./fetch"
import type { WebFetch, WebResponse } from "./types"

const missing = (): Error => new Error("no fetch here")

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("resolveFetch", () => {
  test("returns the configured fetch unchanged", () => {
    const configured: WebFetch = async () => new Response("configured")
    expect(resolveFetch(configured, missing)).toBe(configured)
  })

  test("falls back to the global fetch, read at call time", async () => {
    const first = vi.fn(async () => new Response("first"))
    vi.stubGlobal("fetch", first)
    const resolved = resolveFetch(undefined, missing)
    const second = vi.fn(async () => new Response("second"))
    vi.stubGlobal("fetch", second)

    const response: WebResponse = await resolved("https://example.test/a", { method: "GET" })

    expect(await response.text()).toBe("second")
    expect(second).toHaveBeenCalledWith("https://example.test/a", { method: "GET" })
    expect(first).not.toHaveBeenCalled()
  })

  test("rejects with the caller's error when the global is removed after resolving", async () => {
    vi.stubGlobal("fetch", vi.fn())
    const resolved = resolveFetch(undefined, missing)
    vi.stubGlobal("fetch", undefined)
    await expect(resolved("https://example.test")).rejects.toThrow("no fetch here")
  })

  test("throws the caller's typed error when no fetch exists", () => {
    vi.stubGlobal("fetch", undefined)
    class ConfigError extends Error {}
    expect(() => resolveFetch(undefined, () => new ConfigError("inject fetch"))).toThrow(
      ConfigError,
    )
  })
})
