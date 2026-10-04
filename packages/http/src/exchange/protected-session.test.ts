import type { ProtectedSession } from "@plainworks/std/seam"
import type { WebRequestInit } from "@plainworks/std/web"
import { deferred, flushMicrotasks, manualDelay } from "@plainworks/testkit"
import { expect, test, vi } from "vitest"
import { createHttpClient } from "./client"

test.each(["X-CSRF-Token", "X-Custom-Proof"])(
  "refuses to send injected %s after an origin rewrite",
  async (name) => {
    const fetch = vi.fn(async () => new Response("{}"))
    const client = createHttpClient({
      baseUrl: "https://host.test",
      protectedSession: {
        acquire: async () => ({
          signal: new AbortController().signal,
          headers: { [name]: "proof" },
          release() {},
        }),
        revalidate: async () => {},
        invalidate() {},
      },
      interceptors: [(next) => (request) => next({ ...request, url: "https://other.test/path" })],
      fetch,
    })
    await expect(client.get("/protected")).rejects.toMatchObject({ kind: "http/unsafe-url" })
    expect(fetch).not.toHaveBeenCalled()
  },
)

test("same-origin protected requests disable automatic redirects for every injected proof", async () => {
  const client = createHttpClient({
    baseUrl: "https://host.test",
    authProvider: async () => ({ "X-Custom-Proof": "proof" }),
    fetch: async (_url, init) => {
      expect(init?.redirect).toBe("error")
      return new Response("{}")
    },
  })
  await client.get("/protected")
})

test("100 protected requests cancel even if fetch ignores abort and release every lease", async () => {
  const delay = manualDelay()
  const release = vi.fn()
  for (let i = 0; i < 100; i++) {
    const lifetime = new AbortController()
    const session: ProtectedSession = {
      acquire: async () => ({
        signal: lifetime.signal,
        headers: { "X-CSRF-Token": "csrf" },
        release,
      }),
      revalidate: async () => {},
      invalidate: (cause) => lifetime.abort(cause),
    }
    const held = deferred<never>()
    const client = createHttpClient({
      baseUrl: "https://host.test",
      protectedSession: session,
      delay: delay.delay,
      fetch: async (_url, init) => {
        expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("csrf")
        return held.promise
      },
    })
    const request = client.get("/protected")
    await flushMicrotasks()
    lifetime.abort()
    await expect(request).rejects.toMatchObject({ kind: "std/aborted" })
    held.reject(new Error("late response"))
  }
  expect(release).toHaveBeenCalledTimes(100)
  expect(delay.pending).toHaveLength(0)
})

test("an authoritative authentication error invalidates the shared lifetime", async () => {
  const lifetime = new AbortController()
  const invalidate = vi.fn((cause: unknown) => lifetime.abort(cause))
  const client = createHttpClient({
    baseUrl: "https://host.test",
    protectedSession: {
      acquire: async () => ({ signal: lifetime.signal, headers: {}, release: () => {} }),
      revalidate: async () => {},
      invalidate,
    },
    fetch: async () => new Response(null, { status: 401 }),
  })
  await expect(client.get("/protected")).rejects.toThrow()
  expect(invalidate).toHaveBeenCalledOnce()
  expect(lifetime.signal.aborted).toBe(true)
})

test("an interceptor that rebuilds the request cannot shed lease proof tracking", async () => {
  const fetch = vi.fn(async () => new Response("{}"))
  const client = createHttpClient({
    baseUrl: "https://host.test",
    protectedSession: {
      acquire: async () => ({
        signal: new AbortController().signal,
        headers: { "X-Custom-Proof": "proof" },
        release() {},
      }),
      revalidate: async () => {},
      invalidate() {},
    },
    interceptors: [
      (next) => (request) =>
        next({ method: request.method, url: "https://other.test/path", headers: request.headers }),
    ],
    fetch,
  })
  await expect(client.get("/protected")).rejects.toMatchObject({ kind: "http/unsafe-url" })
  expect(fetch).not.toHaveBeenCalled()
})

test("same-origin session proof disables automatic redirects", async () => {
  const fetch = vi.fn(async (_url: unknown, init?: WebRequestInit) => {
    expect(init?.redirect).toBe("error")
    return new Response("{}")
  })
  const client = createHttpClient({
    baseUrl: "https://host.test",
    protectedSession: {
      acquire: async () => ({
        signal: new AbortController().signal,
        headers: { "X-Custom-Proof": "proof" },
        release() {},
      }),
      revalidate: async () => {},
      invalidate() {},
    },
    fetch,
  })
  await client.get("/protected")
  expect(fetch).toHaveBeenCalledOnce()
})
