import { describe, expect, it } from "vitest"
import { type RuntimeErrorPage, watchRuntimeErrors } from "./runtime-errors"

type Listener = (payload: never) => void

/** A page double that records listeners and routes so a test can emit browser events. */
function fakePage() {
  const listeners = new Map<string, Listener[]>()
  const routes: {
    match: (url: URL) => boolean
    handler: (route: {
      request(): { method(): string; url(): string }
      abort(code?: string): Promise<void>
    }) => Promise<void>
  }[] = []
  const page: RuntimeErrorPage = {
    on(event: string, listener: Listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
      return page
    },
    async route(match, handler) {
      routes.push({ match, handler: handler as (typeof routes)[number]["handler"] })
    },
  }
  const emit = (event: string, payload: unknown): void => {
    for (const listener of listeners.get(event) ?? [])
      (listener as (value: unknown) => void)(payload)
  }
  const console = (type: string, text: string): void =>
    emit("console", { type: () => type, text: () => text })
  /** Send a request through the routed predicates; resolves whether it was aborted. */
  const request = async (method: string, href: string): Promise<boolean> => {
    const url = new URL(href)
    const route = routes.find((candidate) => candidate.match(url))
    if (route === undefined) return false
    let aborted = false
    await route.handler({
      request: () => ({ method: () => method, url: () => href }),
      abort: async () => {
        aborted = true
      },
    })
    return aborted
  }
  return { page, emit, console, request }
}

const ORIGIN = "http://127.0.0.1:5199"

describe("watchRuntimeErrors", () => {
  it("passes a page that raised nothing", async () => {
    const fake = fakePage()
    const watch = await watchRuntimeErrors(fake.page, { allowedOrigins: [ORIGIN] })
    fake.console("log", "ready")
    fake.console("warning", "deprecated")
    expect(watch.errors).toEqual([])
    expect(() => watch.expectNone()).not.toThrow()
  })

  it("records uncaught page errors and console errors, and names hydration mismatches", async () => {
    const fake = fakePage()
    const watch = await watchRuntimeErrors(fake.page, { allowedOrigins: [ORIGIN] })
    fake.emit("pageerror", new Error("boom"))
    fake.console("error", "Failed to fetch")
    fake.console("error", "Hydration failed because the server rendered HTML didn't match")
    expect(watch.errors.map((error) => error.kind)).toEqual(["pageerror", "console", "hydration"])
    expect(() => watch.expectNone()).toThrow(/pageerror: boom[\s\S]*hydration: Hydration failed/)
  })

  it("cuts a message a page makes enormous, so one error cannot flood memory or the report", async () => {
    const fake = fakePage()
    const watch = await watchRuntimeErrors(fake.page, { allowedOrigins: [ORIGIN] })
    fake.console("error", "x".repeat(1_000_000))
    const [error] = watch.errors
    expect(error?.message.length).toBeLessThan(5_000)
    expect(error?.message).toMatch(/…\(cut at \d+ chars\)$/)
  })

  it("blocks and records a request to any origin outside the allowed set", async () => {
    const fake = fakePage()
    const watch = await watchRuntimeErrors(fake.page, { allowedOrigins: [ORIGIN] })
    expect(await fake.request("GET", `${ORIGIN}/api/tasks`)).toBe(false)
    expect(await fake.request("GET", "https://picsum.photos/seed/x/400/300")).toBe(true)
    expect(watch.errors).toEqual([
      { kind: "request", message: "GET https://picsum.photos/seed/x/400/300" },
    ])
  })

  it("ignores an error the owning test declared as expected", async () => {
    const fake = fakePage()
    const watch = await watchRuntimeErrors(fake.page, { allowedOrigins: [ORIGIN] })
    watch.allow(/status of 500/)
    fake.console("error", "Failed to load resource: the server responded with a status of 500")
    fake.console("error", "Unexpected token")
    expect(watch.errors.map((error) => error.message)).toEqual(["Unexpected token"])
  })

  it("hands recorded errors to a caller that takes ownership, so the end-of-test check skips them", async () => {
    const fake = fakePage()
    const watch = await watchRuntimeErrors(fake.page, { allowedOrigins: [ORIGIN] })
    fake.emit("pageerror", new Error("boom"))
    expect(watch.drain()).toEqual([{ kind: "pageerror", message: "boom" }])
    expect(watch.errors).toEqual([])
    expect(() => watch.expectNone()).not.toThrow()
    fake.console("error", "later")
    expect(watch.drain()).toEqual([{ kind: "console", message: "later" }])
  })

  it("requires at least one allowed origin, so the network guard can never be open", async () => {
    await expect(watchRuntimeErrors(fakePage().page, { allowedOrigins: [] })).rejects.toThrow(
      RangeError,
    )
  })
})
