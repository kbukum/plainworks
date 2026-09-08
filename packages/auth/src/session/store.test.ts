import type { Identity, WebAbortSignal } from "@plainworks/std"
import { deferred, flushMicrotasks, manualClock, manualDelay } from "@plainworks/testkit"
import { describe, expect, test, vi } from "vitest"
import { createAuthStore, type TokenSet } from "./store"

const IDENTITY: Identity = { subject: "user-1", claims: { role: "admin" } }

/** A token set expiring at `expiresAt` (epoch ms), optionally carrying identity. */
function tokens(accessToken: string, expiresAt: number, identity?: Identity | null): TokenSet {
  return identity === undefined ? { accessToken, expiresAt } : { accessToken, expiresAt, identity }
}

describe("createAuthStore — snapshot + header basics", () => {
  test("starts unauthenticated and returns no header", async () => {
    const store = createAuthStore()
    expect(store.getSnapshot()).toEqual({ status: "unauthenticated", identity: null })
    expect(await store.getAuthHeader()).toBeUndefined()
  })

  test("setSession authenticates and getAuthHeader returns a Bearer header while fresh", async () => {
    const clock = manualClock(0)
    const store = createAuthStore({ clock })
    store.setSession(tokens("tok-1", 60_000, IDENTITY))

    expect(store.getSnapshot()).toEqual({ status: "authenticated", identity: IDENTITY })
    expect(await store.getAuthHeader()).toEqual({ Authorization: "Bearer tok-1" })
  })

  test("honors a custom header name and scheme", async () => {
    const store = createAuthStore({ clock: manualClock(0), headerName: "X-Auth", scheme: "Token" })
    store.setSession(tokens("abc", 60_000, IDENTITY))
    expect(await store.getAuthHeader()).toEqual({ "X-Auth": "Token abc" })
  })

  test("setSession with an explicit null identity does not retain the previous identity", () => {
    const store = createAuthStore({ clock: manualClock(0) })
    store.setSession(tokens("a", 60_000, IDENTITY))
    expect(store.getSnapshot().status).toBe("authenticated")

    // A login result that resolves no caller must clear identity, never leak the previous user's.
    store.setSession(tokens("b", 60_000, null))
    expect(store.getSnapshot()).toEqual({ status: "unauthenticated", identity: null })
  })

  test("subscribe reports session changes and unsubscribe detaches", () => {
    const store = createAuthStore({ clock: manualClock(0) })
    const seen: string[] = []
    const unsubscribe = store.subscribe((snapshot) => seen.push(snapshot.status))
    store.setSession(tokens("t", 60_000, IDENTITY))
    unsubscribe()
    store.logout()
    expect(seen).toEqual(["authenticated"])
  })
})

describe("createAuthStore — lazy refresh", () => {
  test("refreshes lazily when the token is within the expiry leeway, then serves the new header", async () => {
    const clock = manualClock(0)
    const refresh = vi.fn(async () => tokens("fresh", 120_000, IDENTITY))
    const store = createAuthStore({ clock, refresh, expiryLeewayMs: 5_000 })

    store.setSession(tokens("stale", 10_000, IDENTITY))
    // Move to within the 5s leeway of the 10s expiry: the next header read triggers a refresh.
    clock.set(6_000)

    expect(await store.getAuthHeader()).toEqual({ Authorization: "Bearer fresh" })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test("degrades to undefined (never throws) when refresh rejects, and clears the session", async () => {
    const clock = manualClock(0)
    const refresh = vi.fn(async () => {
      throw new Error("provider down")
    })
    const store = createAuthStore({ clock, refresh })
    store.setSession(tokens("stale", 1_000, IDENTITY))
    clock.set(2_000)

    expect(await store.getAuthHeader()).toBeUndefined()
    expect(store.getSnapshot()).toEqual({ status: "unauthenticated", identity: null })
  })

  test("does not refresh while the token is comfortably fresh", async () => {
    const clock = manualClock(0)
    const refresh = vi.fn(async () => tokens("nope", 999_999))
    const store = createAuthStore({ clock, refresh, expiryLeewayMs: 1_000 })
    store.setSession(tokens("good", 60_000, IDENTITY))

    await store.getAuthHeader()
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe("createAuthStore — single-flight (stampede)", () => {
  test("concurrent header reads share one in-flight refresh", async () => {
    const clock = manualClock(0)
    const gate = deferred<TokenSet>()
    const refresh = vi.fn(() => gate.promise)
    const store = createAuthStore({ clock, refresh, delay: manualDelay().delay })
    store.setSession(tokens("stale", 1_000, IDENTITY))
    clock.set(2_000)

    const reads = [store.getAuthHeader(), store.getAuthHeader(), store.getAuthHeader()]
    await flushMicrotasks()
    gate.resolve(tokens("shared", 120_000, IDENTITY))

    const headers = await Promise.all(reads)
    expect(refresh).toHaveBeenCalledTimes(1)
    for (const header of headers) {
      expect(header).toEqual({ Authorization: "Bearer shared" })
    }
  })

  test("a caller aborting its context signal stops its own await but not the shared refresh", async () => {
    const clock = manualClock(0)
    const gate = deferred<TokenSet>()
    const refresh = vi.fn(() => gate.promise)
    const store = createAuthStore({ clock, refresh, delay: manualDelay().delay })
    store.setSession(tokens("stale", 1_000, IDENTITY))
    clock.set(2_000)

    const controller = new AbortController()
    const read = store.getAuthHeader({ signal: controller.signal })
    await flushMicrotasks()
    // The caller cancels its own request; this must not tear down the store-owned shared refresh.
    controller.abort()
    expect(await read).toBeUndefined()
    expect(store.getSnapshot()).toEqual({ status: "authenticated", identity: IDENTITY })

    // The shared refresh still completes and establishes the fresh credential for later reads.
    gate.resolve(tokens("fresh", 120_000, IDENTITY))
    await flushMicrotasks()
    expect(await store.getAuthHeader()).toEqual({ Authorization: "Bearer fresh" })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test("an already-aborted context signal returns undefined without starting to await", async () => {
    const clock = manualClock(0)
    const gate = deferred<TokenSet>()
    const refresh = vi.fn(() => gate.promise)
    const store = createAuthStore({ clock, refresh, delay: manualDelay().delay })
    store.setSession(tokens("stale", 1_000, IDENTITY))
    clock.set(2_000)

    const aborted = new AbortController()
    aborted.abort()
    expect(await store.getAuthHeader({ signal: aborted.signal })).toBeUndefined()
    expect(store.getSnapshot().status).toBe("authenticated")
    gate.resolve(tokens("fresh", 120_000, IDENTITY))
  })
})

describe("createAuthStore — A1: logout neutralizes a late refresh", () => {
  test("a refresh that resolves after logout is dropped; session stays null with no auth change", async () => {
    const clock = manualClock(0)
    const gate = deferred<TokenSet>()
    // A refresh that ignores its abort signal and resolves anyway — proving the generation guard.
    const refresh = vi.fn(() => gate.promise)
    const store = createAuthStore({ clock, refresh, delay: manualDelay().delay })

    store.setSession(tokens("stale", 1_000, IDENTITY))
    clock.set(2_000)

    const changes: string[] = []
    store.subscribe((snapshot) => changes.push(snapshot.status))

    const read = store.getAuthHeader()
    await flushMicrotasks()
    store.logout()
    // The stale refresh completes only now — after logout.
    gate.resolve(tokens("resurrected", 999_999, IDENTITY))

    expect(await read).toBeUndefined()
    expect(store.getSnapshot()).toEqual({ status: "unauthenticated", identity: null })
    // Only the logout transition fired; the late refresh produced no "authenticated" change.
    expect(changes).toEqual(["unauthenticated"])
  })

  test("logout aborts the in-flight refresh signal (real teardown, not just discard)", async () => {
    const clock = manualClock(0)
    let captured: WebAbortSignal | undefined
    const gate = deferred<TokenSet>()
    const refresh = vi.fn((signal: WebAbortSignal) => {
      captured = signal
      return gate.promise
    })
    const store = createAuthStore({ clock, refresh, delay: manualDelay().delay })
    store.setSession(tokens("stale", 1_000, IDENTITY))
    clock.set(2_000)

    const read = store.getAuthHeader()
    await flushMicrotasks()
    expect(captured?.aborted).toBe(false)
    store.logout()

    expect(captured?.aborted).toBe(true)
    await read
    gate.resolve(tokens("x", 1))
  })
})

describe("createAuthStore — A2: a hung refresh is bounded and retryable", () => {
  test("times out a hung refresh, clears single-flight, and the next call retries", async () => {
    const clock = manualClock(0)
    const timers = manualDelay()
    const hung = deferred<TokenSet>()
    const refresh = vi
      .fn<(signal: WebAbortSignal) => Promise<TokenSet>>()
      // First attempt hangs forever (ignores its signal) until the deadline fires.
      .mockImplementationOnce(() => hung.promise)
      // Second attempt succeeds — proving single-flight was released.
      .mockImplementationOnce(async () => tokens("recovered", 120_000, IDENTITY))

    const store = createAuthStore({
      clock,
      refresh,
      refreshTimeoutMs: 30_000,
      delay: timers.delay,
    })
    store.setSession(tokens("stale", 1_000, IDENTITY))
    clock.set(2_000)

    const firstRead = store.getAuthHeader()
    await flushMicrotasks()
    // Elapse the refresh deadline: withTimeout rejects even though the refresh never settled.
    expect(timers.fireNext()).toBe(true)
    expect(await firstRead).toBeUndefined()
    expect(store.getSnapshot().status).toBe("unauthenticated")

    const secondRead = store.getAuthHeader()
    expect(await secondRead).toEqual({ Authorization: "Bearer recovered" })
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
