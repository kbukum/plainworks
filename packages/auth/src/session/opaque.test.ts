import { fixedClock } from "@plainworks/std/time"
import type { WebFetch, WebRequestInit, WebResponse } from "@plainworks/std/web"
import { deferred, flushMicrotasks, manualClock, manualDelay } from "@plainworks/testkit"
import { describe, expect, test, vi } from "vitest"
import { createAuthStore } from "./store"

const authenticated = {
  status: "authenticated",
  identity: { subject: "user-123", kind: "user", restrictions: { mode: "unrestricted" } },
  expiresAt: "2099-01-01T01:00:00Z",
  csrfToken: "csrf-proof",
}

describe("opaque browser sessions", () => {
  test("state transitions replace stale expiry, error and revocation fields", async () => {
    const session = createAuthStore({
      clock: fixedClock("2099-01-01T00:00:00Z"),
      fetch: async (url) => {
        if (String(url).endsWith("/logout")) throw new Error("store unavailable")
        return Response.json(authenticated)
      },
    })
    try {
      await session.login({ username: "ada", password: "secret" })
      await expect(session.logout()).rejects.toThrow()
      expect(session.getSnapshot().expiresAt).toBeUndefined()
      await session.login({ username: "ada", password: "secret" })
      expect(session.getSnapshot()).toEqual({
        status: "authenticated",
        identity: authenticated.identity,
        expiresAt: authenticated.expiresAt,
      })
    } finally {
      session.close()
    }
  })

  test("decodes the published identity without claims conversion and sends only CSRF", async () => {
    const requests: WebRequestInit[] = []
    const session = createAuthStore({
      clock: fixedClock("2099-01-01T00:00:00Z"),
      fetch: async (_url, init) => {
        requests.push(init ?? {})
        return Response.json(authenticated)
      },
    })
    await session.login({ username: "ada", password: "secret" })
    expect(session.getSnapshot().identity).toEqual(authenticated.identity)
    expect(await session.getAuthHeader()).toEqual({ "X-CSRF-Token": "csrf-proof" })
    expect(requests[0]).toMatchObject({ method: "POST", credentials: "same-origin" })
    expect(JSON.stringify(session.getSnapshot())).not.toContain("secret")
    session.close()
  })

  test("single-flight status is fenced by logout even if the server ignores cancellation", async () => {
    const held = deferred<WebResponse>()
    const fetch = vi.fn<WebFetch>(async (url) =>
      String(url).endsWith("/login")
        ? Response.json(authenticated)
        : String(url).endsWith("/logout")
          ? new Response(null, { status: 204 })
          : held.promise,
    )
    const session = createAuthStore({ fetch, clock: fixedClock("2099-01-01T00:00:00Z") })
    await session.login({ username: "ada", password: "secret" })
    const status = session.revalidate()
    const duplicate = session.revalidate()
    await flushMicrotasks()
    const logout = session.logout()
    held.resolve(Response.json(authenticated))
    await Promise.allSettled([status, duplicate, logout])
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/session"))).toHaveLength(1)
    expect(session.getSnapshot().status).toBe("unauthenticated")
    session.close()
  })

  test("local logout cancels protected work before failed revocation settles", async () => {
    const session = createAuthStore({
      clock: fixedClock("2099-01-01T00:00:00Z"),
      fetch: async (url) => {
        if (String(url).endsWith("/logout")) throw new Error("store unavailable")
        return Response.json(authenticated)
      },
    })
    await session.revalidate()
    const lease = await session.protectedSession.acquire()
    await expect(session.logout()).rejects.toThrow()
    expect(lease.signal.aborted).toBe(true)
    expect(session.getSnapshot()).toMatchObject({
      status: "unauthenticated",
      revocation: "unconfirmed",
    })
    lease.release()
    session.close()
  })

  test("operational status failure fails closed and cancels protected work", async () => {
    let unavailable = false
    const session = createAuthStore({
      clock: fixedClock("2099-01-01T00:00:00Z"),
      fetch: async () => {
        if (unavailable) return new Response(null, { status: 503 })
        return Response.json(authenticated)
      },
    })
    await session.revalidate()
    const lease = await session.protectedSession.acquire()
    unavailable = true
    await expect(session.revalidate()).rejects.toThrow()
    expect(lease.signal.aborted).toBe(true)
    expect(session.getSnapshot().status).toBe("unauthenticated")
    lease.release()
    session.close()
  })

  test("100 close cycles leave no expiry or status timers", async () => {
    vi.useFakeTimers()
    try {
      for (let i = 0; i < 100; i++) {
        const session = createAuthStore({
          fetch: async () => Response.json(authenticated),
          clock: fixedClock("2099-01-01T00:00:00Z"),
        })
        await session.revalidate()
        const lease = await session.protectedSession.acquire()
        session.close()
        expect(lease.signal.aborted).toBe(true)
        lease.release()
      }
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  test("status is bounded at one second even when the source ignores its signal", async () => {
    const delay = manualDelay()
    const held = deferred<WebResponse>()
    const session = createAuthStore({
      delay: delay.delay,
      fetch: async () => held.promise,
    })
    const status = session.revalidate()
    await flushMicrotasks()
    delay.fireWhere((ms) => ms === 1000)
    await expect(status).rejects.toThrow()
    expect(session.getSnapshot().status).toBe("unauthenticated")
    held.resolve(Response.json(authenticated))
    await flushMicrotasks()
    expect(session.getSnapshot().status).toBe("unauthenticated")
    session.close()
    expect(delay.pending).toHaveLength(0)
  })

  test("expiry tears down all protected work without any refresh request", async () => {
    const delay = manualDelay()
    const clock = manualClock(0)
    const fetch = vi.fn<WebFetch>(async () =>
      Response.json({
        ...authenticated,
        expiresAt: "1970-01-01T00:00:01Z",
      }),
    )
    const session = createAuthStore({ clock, delay: delay.delay, fetch })
    await session.revalidate()
    const lease = await session.protectedSession.acquire()
    clock.set(1000)
    delay.fireWhere((ms) => ms === 1000)
    await flushMicrotasks()
    expect(lease.signal.aborted).toBe(true)
    expect(session.getSnapshot().status).toBe("unauthenticated")
    await expect(session.protectedSession.acquire()).rejects.toThrow()
    expect(fetch).toHaveBeenCalledOnce()
    lease.release()
    session.close()
  })

  test("measures the lifetime on the server's clock, so a skewed browser clock keeps the session", async () => {
    const delay = manualDelay()
    // The browser runs months behind the server; only the server's Date anchors the expiry.
    const session = createAuthStore({
      clock: fixedClock("2098-03-01T00:00:00Z"),
      delay: delay.delay,
      fetch: async () =>
        Response.json(
          { ...authenticated, expiresAt: "2099-01-01T00:30:00Z" },
          { headers: { date: "Thu, 01 Jan 2099 00:00:00 GMT" } },
        ),
    })
    await session.revalidate()
    expect(session.getSnapshot().status).toBe("authenticated")
    expect(delay.pending.some((wait) => wait.ms === 1_800_000)).toBe(true)
    delay.fireWhere((ms) => ms === 1_800_000)
    await flushMicrotasks()
    expect(session.getSnapshot().status).toBe("unauthenticated")
    session.close()
  })

  test("caller cancellation never lets logout overtake an unconfirmed initial login", async () => {
    const held = deferred<WebResponse>()
    const requests: string[] = []
    const fetch: WebFetch = async (url, init) => {
      requests.push(String(url))
      if (String(url).endsWith("/login")) return held.promise
      expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe(authenticated.csrfToken)
      return new Response(null, { status: 204 })
    }
    const session = createAuthStore({ fetch, clock: fixedClock("2099-01-01T00:00:00Z") })
    const caller = new AbortController()
    const login = session.login({ username: "ada", password: "fixture-password" }, caller.signal)
    await flushMicrotasks()
    caller.abort()
    await expect(login).rejects.toMatchObject({ kind: "std/aborted" })
    const logout = session.logout()
    await flushMicrotasks()
    expect(requests).toEqual(["/auth/login"])
    held.resolve(Response.json(authenticated))
    await logout
    expect(requests).toEqual(["/auth/login", "/auth/logout"])
    expect(session.getSnapshot()).toMatchObject({
      status: "unauthenticated",
      revocation: "confirmed",
    })
    await expect(session.protectedSession.acquire()).rejects.toThrow()
    session.close()
  })

  test("one canceled status waiter cannot cancel the shared authoritative check", async () => {
    const held = deferred<WebResponse>()
    const session = createAuthStore({
      fetch: async () => held.promise,
      clock: fixedClock("2099-01-01T00:00:00Z"),
    })
    const caller = new AbortController()
    const abandoned = session.revalidate({ signal: caller.signal })
    const remaining = session.revalidate()
    caller.abort()
    await expect(abandoned).rejects.toMatchObject({ kind: "std/aborted" })
    held.resolve(Response.json(authenticated))
    await remaining
    expect(session.getSnapshot().status).toBe("authenticated")
    session.close()
  })

  test("malformed successful status and login responses fail closed", async () => {
    const session = createAuthStore({
      fetch: async () => Response.json({ status: "authenticated" }),
    })
    await expect(session.login({ username: "ada", password: "fixture-password" })).rejects.toThrow()
    await expect(session.revalidate()).rejects.toThrow()
    expect(session.getSnapshot().status).toBe("unauthenticated")
    session.close()
  })

  test("logout rejection cannot silently restore a still-live server cookie", async () => {
    const fetch = vi.fn<WebFetch>(async (url) =>
      String(url).endsWith("/logout")
        ? new Response(null, { status: 503 })
        : Response.json(authenticated),
    )
    const session = createAuthStore({ fetch, clock: fixedClock("2099-01-01T00:00:00Z") })
    await session.revalidate()
    await expect(session.logout()).rejects.toThrow()
    const calls = fetch.mock.calls.length
    await expect(session.revalidate()).rejects.toThrow()
    await expect(session.getAuthHeader()).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(calls)
    expect(session.getSnapshot()).toMatchObject({
      status: "unauthenticated",
      revocation: "unconfirmed",
    })
    session.close()
  })

  test("logout replaces a cached CSRF proof rejected after another tab rotated the cookie", async () => {
    let current = "csrf-a"
    const sent: (string | null)[] = []
    const fetch = vi.fn<WebFetch>(async (url, init) => {
      if (!String(url).endsWith("/logout"))
        return Response.json({ ...authenticated, csrfToken: current })
      const proof = new Headers(init?.headers).get("X-CSRF-Token")
      sent.push(proof)
      return new Response(null, { status: proof === current ? 204 : 403 })
    })
    const session = createAuthStore({ fetch, clock: fixedClock("2099-01-01T00:00:00Z") })
    await session.login({ username: "ada", password: "secret" })
    current = "csrf-b"
    await session.logout()
    expect(sent).toEqual(["csrf-a", "csrf-b"])
    expect(session.getSnapshot()).toMatchObject({
      status: "unauthenticated",
      revocation: "confirmed",
    })
    session.close()
  })

  test("a failed logout never repeats its rejected CSRF proof", async () => {
    const sent: (string | null)[] = []
    let status = 503
    const fetch = vi.fn<WebFetch>(async (url, init) => {
      if (!String(url).endsWith("/logout")) return Response.json(authenticated)
      sent.push(new Headers(init?.headers).get("X-CSRF-Token"))
      return new Response(null, { status })
    })
    const session = createAuthStore({ fetch, clock: fixedClock("2099-01-01T00:00:00Z") })
    await session.login({ username: "ada", password: "secret" })
    await expect(session.logout()).rejects.toThrow()
    status = 204
    await session.logout()
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/session"))).toHaveLength(1)
    expect(sent).toHaveLength(2)
    session.close()
  })

  test("logout preparation and request share one two-second budget", async () => {
    const delay = manualDelay()
    const held = deferred<WebResponse>()
    const session = createAuthStore({
      delay: delay.delay,
      fetch: async (url) =>
        String(url).endsWith("/session") ? Response.json(authenticated) : held.promise,
    })
    const logout = session.logout()
    expect(session.getSnapshot()).toMatchObject({
      status: "unauthenticated",
      revocation: "unconfirmed",
    })
    await flushMicrotasks()
    delay.fireWhere((ms) => ms === 2000)
    await expect(logout).rejects.toThrow()
    held.resolve(new Response(null, { status: 204 }))
    await flushMicrotasks()
    session.close()
    expect(delay.pending).toHaveLength(0)
  })

  test("expiry timer faults cannot silently reacquire the old cookie session", async () => {
    const timers = manualDelay()
    const failed = deferred<void>()
    const fetch = vi.fn<WebFetch>(async () => Response.json(authenticated))
    const session = createAuthStore({
      fetch,
      clock: fixedClock("2099-01-01T00:00:00Z"),
      delay: (ms, signal) => (ms === 3_600_000 ? failed.promise : timers.delay(ms, signal)),
    })
    await session.revalidate()
    const lease = await session.protectedSession.acquire()
    failed.reject(new Error("timer unavailable"))
    await flushMicrotasks()
    expect(lease.signal.aborted).toBe(true)
    await expect(session.revalidate()).rejects.toThrow()
    expect(fetch).toHaveBeenCalledOnce()
    session.close()
    expect(timers.pending).toHaveLength(0)
  })

  test("close cancels owned work, keeps the displayed snapshot, and can start again", async () => {
    const delay = manualDelay()
    const held = deferred<WebResponse>()
    let hold = false
    const fetch = vi.fn<WebFetch>(async () => (hold ? held.promise : Response.json(authenticated)))
    const session = createAuthStore({
      fetch,
      delay: delay.delay,
      clock: fixedClock("2099-01-01T00:00:00Z"),
    })
    await session.revalidate()
    const lease = await session.protectedSession.acquire()
    hold = true
    const status = session.revalidate()
    await flushMicrotasks()
    session.close()
    await expect(status).rejects.toMatchObject({ kind: "std/aborted" })
    expect(lease.signal.aborted).toBe(true)
    expect(delay.pending).toHaveLength(0)
    expect(session.getSnapshot()).toMatchObject({ status: "authenticated" })
    held.resolve(Response.json(authenticated))
    await flushMicrotasks()

    hold = false
    await session.revalidate()
    const next = await session.protectedSession.acquire()
    expect(next.signal.aborted).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(3)
    session.close()
  })

  test("close cancels in-flight and queued mutations", async () => {
    const held = deferred<WebResponse>()
    const requests: string[] = []
    const session = createAuthStore({
      clock: fixedClock("2099-01-01T00:00:00Z"),
      fetch: async (url, init) => {
        requests.push(String(url))
        return new Promise((resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })
          void held.promise.then(resolve)
        })
      },
    })
    const login = session.login({ username: "ada", password: "fixture-password" })
    const queued = session.login({ username: "ada", password: "fixture-password" })
    await flushMicrotasks()
    session.close()
    await expect(login).rejects.toMatchObject({ kind: "std/aborted" })
    await expect(queued).rejects.toMatchObject({ kind: "std/aborted" })
    expect(requests).toEqual(["/auth/login"])
    held.resolve(Response.json(authenticated))
  })
})
