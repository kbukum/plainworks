import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { MOCK_CONTROL_PATHS } from "../control"
import { bindMockServerLifecycle } from "../lifecycle"
import { createMockScopes, MOCK_SCOPE_HEADER, MockScopeError, scopedMockHandlers } from "./scope"

const scoped = (scope?: string): Headers =>
  new Headers(scope === undefined ? {} : { [MOCK_SCOPE_HEADER]: scope })

describe("createMockScopes", () => {
  it("serves one default instance to requests without a scope", () => {
    const create = vi.fn(() => ({}))
    const scopes = createMockScopes({ create })
    const first = scopes.resolve(scoped())
    expect(scopes.resolve(scoped())).toBe(first)
    expect(create).toHaveBeenCalledTimes(1)
    expect(scopes.size).toBe(0)
  })

  it("gives each scope its own instance and reuses it", () => {
    const scopes = createMockScopes({ create: () => ({}) })
    const a = scopes.resolve(scoped("a"))
    const b = scopes.resolve(scoped("b"))
    expect(a).not.toBe(b)
    expect(scopes.resolve(scoped("a"))).toBe(a)
    expect(scopes.resolve(scoped())).not.toBe(a)
    expect(scopes.size).toBe(2)
  })

  it.each([
    ["empty", ""],
    ["too long", "a".repeat(65)],
    ["a separator", "a/b"],
    ["whitespace", "a b"],
  ])("rejects a scope that is %s", (_, scope) => {
    const scopes = createMockScopes({ create: () => ({}) })
    expect(() => scopes.resolve(scoped(scope))).toThrow(MockScopeError)
    expect(() => scopes.release(scoped(scope))).toThrow(MockScopeError)
  })

  it("evicts and disposes the least recently used scope beyond capacity", () => {
    const dispose = vi.fn()
    let next = 0
    const scopes = createMockScopes({ create: () => ({ n: next++ }), dispose, capacity: 2 })
    const a = scopes.resolve(scoped("a"))
    const b = scopes.resolve(scoped("b"))
    // Using `a` again makes `b` the least recently used.
    scopes.resolve(scoped("a"))
    scopes.resolve(scoped("c"))
    expect(dispose).toHaveBeenCalledExactlyOnceWith(b)
    expect(scopes.size).toBe(2)
    expect(scopes.resolve(scoped("a"))).toBe(a)
  })

  it("releases a scope so its next request starts from a fresh instance", () => {
    const dispose = vi.fn()
    const scopes = createMockScopes({ create: () => ({}), dispose })
    const a = scopes.resolve(scoped("a"))
    expect(scopes.release(scoped("a"))).toBe(true)
    expect(dispose).toHaveBeenCalledExactlyOnceWith(a)
    expect(scopes.release(scoped("a"))).toBe(false)
    expect(scopes.release(scoped())).toBe(false)
    expect(scopes.resolve(scoped("a"))).not.toBe(a)
  })

  it("disposes every instance, the default one included, on clear", () => {
    const dispose = vi.fn()
    const scopes = createMockScopes({ create: () => ({}), dispose })
    const fallback = scopes.resolve(scoped())
    const a = scopes.resolve(scoped("a"))
    scopes.clear()
    expect(dispose).toHaveBeenCalledTimes(2)
    expect(dispose).toHaveBeenCalledWith(fallback)
    expect(dispose).toHaveBeenCalledWith(a)
    expect(scopes.size).toBe(0)
    expect(scopes.resolve(scoped("a"))).not.toBe(a)
  })

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY])("refuses a capacity of %s", (capacity) => {
    expect(() => createMockScopes({ create: () => ({}), capacity })).toThrow(RangeError)
  })
})

describe("scopedMockHandlers", () => {
  // One counter per scope: a POST in one scope must never show in another.
  const counters = createMockScopes({ create: () => ({ count: 0 }) })
  const handlers = scopedMockHandlers(counters, (counter) => [
    http.get("*/api/count", () => HttpResponse.json({ count: counter.count })),
    http.post("*/api/count", () => {
      counter.count += 1
      return HttpResponse.json({ count: counter.count })
    }),
  ])
  const fallthrough = http.all("*", () => HttpResponse.json({ unmatched: true }, { status: 404 }))
  const server = setupServer(...handlers, fallthrough)
  bindMockServerLifecycle(server, { hooks: { beforeAll, afterEach, afterAll } })
  afterEach(() => counters.clear())

  const send = (path: string, init: { method?: string; scope?: string } = {}) =>
    fetch(`http://mock.test${path}`, { method: init.method ?? "GET", headers: scoped(init.scope) })

  it("keeps one scope's writes out of another scope and the default", async () => {
    await send("/api/count", { method: "POST", scope: "a" })
    await send("/api/count", { method: "POST", scope: "a" })
    expect(await (await send("/api/count", { scope: "a" })).json()).toEqual({ count: 2 })
    expect(await (await send("/api/count", { scope: "b" })).json()).toEqual({ count: 0 })
    expect(await (await send("/api/count")).json()).toEqual({ count: 0 })
  })

  it("releases the request's scope on DELETE of the scope path", async () => {
    await send("/api/count", { method: "POST", scope: "a" })
    const released = await send(MOCK_CONTROL_PATHS.scope, { method: "DELETE", scope: "a" })
    expect(released.status).toBe(200)
    expect(await released.json()).toEqual({ success: true })
    expect(counters.size).toBe(0)
    expect(await (await send("/api/count", { scope: "a" })).json()).toEqual({ count: 0 })
  })

  it("answers a malformed scope with a 400 problem", async () => {
    const response = await send("/api/count", { scope: "a b" })
    expect(response.status).toBe(400)
    expect(response.headers.get("content-type")).toContain("application/problem+json")
    expect(await response.json()).toMatchObject({ status: 400, title: "Invalid mock scope" })
  })

  it("passes a request no scoped handler matches to the next handler", async () => {
    const response = await send("/elsewhere", { scope: "a" })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ unmatched: true })
  })
})
