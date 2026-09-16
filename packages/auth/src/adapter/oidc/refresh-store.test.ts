import { manualClock } from "@plainworks/testkit"
import { describe, expect, it } from "vitest"
import { AuthError } from "../../errors"
import { createRefreshTokenStore } from "./refresh-store"

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

  it("bounds session capacity, evicting the oldest handle", () => {
    const clock = manualClock(1_000_000)
    const store = createRefreshTokenStore({ maxEntries: 2, ttlSeconds: 100, clock })
    store.issue("sess-1", "rt-1")
    store.issue("sess-2", "rt-2")
    store.issue("sess-3", "rt-3")
    expect(store.current("sess-1")).toBeUndefined()
    expect(store.current("sess-2")).toBe("rt-2")
    expect(store.current("sess-3")).toBe("rt-3")
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
