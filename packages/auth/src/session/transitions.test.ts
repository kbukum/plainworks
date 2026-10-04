import { createHttpClient } from "@plainworks/http"
import { fixedClock } from "@plainworks/std/time"
import type { WebFetch, WebResponse } from "@plainworks/std/web"
import { deferred, flushMicrotasks, manualDelay } from "@plainworks/testkit"
import { describe, expect, test, vi } from "vitest"
import { createAuthStore } from "./store"

const ORIGIN = "https://app.test"
const authenticated = {
  status: "authenticated",
  identity: { subject: "user-123", kind: "user", restrictions: { mode: "unrestricted" } },
  expiresAt: "2099-01-01T01:00:00Z",
  csrfToken: "csrf-proof",
}

// Protection follows each operation: the clients exist before the session settles, and only the
// one that borrows the session waits on, carries, or loses it.
function harness(status: () => Promise<WebResponse>) {
  const api: { url: string; csrf: string | null }[] = []
  const fetch = vi.fn<WebFetch>(async (url, init) => {
    const path = new URL(String(url)).pathname
    if (path === "/auth/session") return status()
    if (path === "/auth/login") return Response.json(authenticated)
    if (path === "/auth/logout") return new Response(null, { status: 204 })
    api.push({ url: path, csrf: new Headers(init?.headers).get("X-CSRF-Token") })
    return Response.json({ ok: true })
  })
  const runtime = createAuthStore({
    baseUrl: `${ORIGIN}/auth`,
    fetch,
    clock: fixedClock("2099-01-01T00:00:00Z"),
  })
  const protectedClient = createHttpClient({
    baseUrl: ORIGIN,
    fetch,
    protectedSession: runtime.protectedSession,
  })
  const publicClient = createHttpClient({ baseUrl: ORIGIN, fetch })
  return { api, runtime, protectedClient, publicClient }
}

describe("per-operation protection with clients that already exist", () => {
  test("guest to login: protected work starts once signed in, public work never waits", async () => {
    const { api, runtime, protectedClient, publicClient } = harness(
      async () => new Response(null, { status: 401 }),
    )
    await expect(protectedClient.get("/api/private")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
    await expect(publicClient.get("/api/public")).resolves.toEqual({ ok: true })
    await runtime.login({ username: "ada", password: "secret" })
    await expect(protectedClient.get("/api/private")).resolves.toEqual({ ok: true })
    expect(api).toEqual([
      { url: "/api/public", csrf: null },
      { url: "/api/private", csrf: "csrf-proof" },
    ])
    runtime.close()
  })

  test("a late initial status holds protected work until it settles", async () => {
    const held = deferred<WebResponse>()
    const { api, runtime, protectedClient } = harness(() => held.promise)
    const pending = protectedClient.get("/api/private")
    await flushMicrotasks()
    expect(api).toEqual([])
    held.resolve(Response.json(authenticated))
    await expect(pending).resolves.toEqual({ ok: true })
    expect(api).toEqual([{ url: "/api/private", csrf: "csrf-proof" }])
    runtime.close()
  })

  test("a failed initial status fails protected work closed and leaves public work usable", async () => {
    const { api, runtime, protectedClient, publicClient } = harness(async () => {
      throw new TypeError("network down")
    })
    await expect(protectedClient.get("/api/private")).rejects.toThrow("network down")
    await expect(publicClient.get("/api/public")).resolves.toEqual({ ok: true })
    expect(api).toEqual([{ url: "/api/public", csrf: null }])
    expect(runtime.getSnapshot().status).toBe("unauthenticated")
    runtime.close()
  })

  test("logout stops later protected work without touching the network; public work continues", async () => {
    const { api, runtime, protectedClient, publicClient } = harness(async () =>
      Response.json(authenticated),
    )
    await runtime.login({ username: "ada", password: "secret" })
    await expect(protectedClient.get("/api/private")).resolves.toEqual({ ok: true })
    await runtime.logout()
    await expect(protectedClient.get("/api/private")).rejects.toMatchObject({
      kind: "auth/session-ended",
    })
    await expect(publicClient.get("/api/public")).resolves.toEqual({ ok: true })
    expect(api).toEqual([
      { url: "/api/private", csrf: "csrf-proof" },
      { url: "/api/public", csrf: null },
    ])
    runtime.close()
  })
})

test("a session closed during authenticated publication leaves no orphaned expiry timer", async () => {
  const delay = manualDelay()
  const fetch = vi.fn<WebFetch>(async (url) => {
    const path = new URL(String(url)).pathname
    if (path === "/auth/login") return Response.json(authenticated)
    return new Response(null, { status: 401 })
  })
  const runtime = createAuthStore({
    baseUrl: `${ORIGIN}/auth`,
    fetch,
    clock: fixedClock("2099-01-01T00:00:00Z"),
    delay: delay.delay,
  })
  // A subscriber tears the session down the instant it becomes authenticated — mid-publication.
  const unsubscribe = runtime.subscribe((state) => {
    if (state.status === "authenticated") runtime.close()
  })
  await runtime.login({ username: "ada", password: "secret" })
  unsubscribe()
  // A closed session arms no timer; a leaked expiry timer would still be pending here.
  expect(delay.pending).toHaveLength(0)
})
