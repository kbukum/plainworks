import { manualClock } from "@plainworks/std/time"
import { describe, expect, it, test } from "vitest"
import { AuthError } from "../../errors"
import { createRefreshTokenStore, decideRefreshRotation, refreshStoreLimits } from "./refresh-store"

describe("createRefreshTokenStore custody", () => {
  it("issues, reads, and revokes a token by session handle", () => {
    const store = createRefreshTokenStore()
    store.issue("sess-1", "rt-1")
    expect(store.current("sess-1")).toBe("rt-1")
    expect(store.current("sess-2")).toBeUndefined()
    store.revoke("sess-1")
    expect(store.current("sess-1")).toBeUndefined()
  })

  it("expires a token once its TTL elapses", () => {
    const clock = manualClock(1_000_000)
    const store = createRefreshTokenStore({ ttlSeconds: 60, clock })
    store.issue("sess-1", "rt-1")
    expect(store.current("sess-1")).toBe("rt-1")
    clock.advance(60_001)
    expect(store.current("sess-1")).toBeUndefined()
  })

  it("rejects capacity exhaustion without evicting live custody", () => {
    const clock = manualClock(1_000_000)
    const store = createRefreshTokenStore({ maxEntries: 2, ttlSeconds: 100, clock })
    store.issue("sess-1", "rt-1")
    store.issue("sess-2", "rt-2")
    expect(() => store.issue("sess-3", "rt-3")).toThrowError(AuthError)
    expect(store.current("sess-1")).toBe("rt-1")
    expect(store.current("sess-2")).toBe("rt-2")
    expect(store.current("sess-3")).toBeUndefined()
  })

  it("retains revocation so late admission cannot revive the same handle", () => {
    const store = createRefreshTokenStore()
    store.revoke("pending")
    expect(() => store.issue("pending", "late")).toThrowError(AuthError)
    expect(store.current("pending")).toBeUndefined()
  })

  it("rotation does not extend absolute custody expiry", () => {
    const clock = manualClock(0)
    const store = createRefreshTokenStore({ ttlSeconds: 1, clock })
    store.issue("session", "first")
    clock.set(900)
    store.rotate("session", "first", "second")
    clock.set(1000)
    expect(store.current("session")).toBeUndefined()
  })

  it("purges expired handles before evicting a live one on a capacity breach", () => {
    const clock = manualClock(1_000_000)
    const store = createRefreshTokenStore({ maxEntries: 2, ttlSeconds: 100, clock })
    store.issue("sess-1", "rt-1")
    clock.advance(50_000)
    store.issue("sess-2", "rt-2")
    clock.advance(60_000)
    store.issue("sess-3", "rt-3")
    expect(store.current("sess-1")).toBeUndefined()
    expect(store.current("sess-2")).toBe("rt-2")
    expect(store.current("sess-3")).toBe("rt-3")
  })

  it("validates configuration options", () => {
    expect(() => createRefreshTokenStore({ ttlSeconds: 0 })).toThrowError(AuthError)
    expect(() => createRefreshTokenStore({ ttlSeconds: -10 })).toThrowError(AuthError)
    expect(() => createRefreshTokenStore({ ttlSeconds: 1.5 })).toThrowError(AuthError)
    expect(() => createRefreshTokenStore({ maxEntries: 0 })).toThrowError(AuthError)
    expect(() => createRefreshTokenStore({ maxEntries: 2.2 })).toThrowError(AuthError)
  })
})

describe("createRefreshTokenStore rotation + reuse detection", () => {
  it("rotates the live token, advancing custody to the replacement", () => {
    const store = createRefreshTokenStore()
    store.issue("sess-1", "rt-1")
    expect(store.rotate("sess-1", "rt-1", "rt-2")).toEqual({ status: "rotated" })
    expect(store.current("sess-1")).toBe("rt-2")
    expect(store.rotate("sess-1", "rt-2", "rt-3")).toEqual({ status: "rotated" })
    expect(store.current("sess-1")).toBe("rt-3")
  })

  it("detects a replay of a retired token and purges the family", () => {
    const store = createRefreshTokenStore()
    store.issue("sess-1", "rt-1")
    store.rotate("sess-1", "rt-1", "rt-2")
    expect(store.rotate("sess-1", "rt-1", "rt-attacker")).toEqual({ status: "reuse-detected" })
    // The family is purged: even the legitimate live token no longer resolves.
    expect(store.current("sess-1")).toBeUndefined()
  })

  it("detects a replay of a much older retired token, not just the immediately-prior one", () => {
    const store = createRefreshTokenStore()
    store.issue("sess-1", "rt-1")
    store.rotate("sess-1", "rt-1", "rt-2")
    store.rotate("sess-1", "rt-2", "rt-3")
    expect(store.rotate("sess-1", "rt-1", "rt-x")).toEqual({ status: "reuse-detected" })
  })

  it("treats a rotation against an unknown or revoked handle as reuse", () => {
    const store = createRefreshTokenStore()
    expect(store.rotate("ghost", "rt-1", "rt-2")).toEqual({ status: "reuse-detected" })
    store.issue("sess-1", "rt-1")
    store.revoke("sess-1")
    expect(store.rotate("sess-1", "rt-1", "rt-2")).toEqual({ status: "reuse-detected" })
  })
})

describe("refreshStoreLimits", () => {
  test("defaults to one hour of custody and 10_000 entries", () => {
    expect(refreshStoreLimits({})).toEqual({ ttlMs: 3_600_000, maxEntries: 10_000 })
    expect(refreshStoreLimits({ ttlSeconds: 60, maxEntries: 2 })).toEqual({
      ttlMs: 60_000,
      maxEntries: 2,
    })
  })

  test("rejects a lifetime or capacity that is not a positive integer", () => {
    for (const options of [{ ttlSeconds: 0 }, { maxEntries: -1 }, { ttlSeconds: 1.5 }]) {
      expect(() => refreshStoreLimits(options)).toThrow(
        expect.objectContaining({ kind: "auth/config" }),
      )
    }
  })
})

describe("decideRefreshRotation", () => {
  test("rotates only when the presented token is the live one", () => {
    expect(decideRefreshRotation("live", "live")).toEqual({ status: "rotated" })
  })

  test("reads a superseded, unknown or custody-less token as reuse", () => {
    expect(decideRefreshRotation("live", "old")).toEqual({ status: "reuse-detected" })
    expect(decideRefreshRotation("live", "")).toEqual({ status: "reuse-detected" })
    expect(decideRefreshRotation(undefined, "live")).toEqual({ status: "reuse-detected" })
  })
})
