import { manualClock } from "@plainworks/testkit"
import { describe, expect, it } from "vitest"
import { AuthError } from "../../errors"
import { createMemoryTokenStore } from "./token-store"

describe("createMemoryTokenStore", () => {
  it("stores and retrieves tokens by session handle", () => {
    const store = createMemoryTokenStore()
    store.set("sess-1", "refresh-token-1")
    expect(store.get("sess-1")).toBe("refresh-token-1")
    expect(store.get("sess-2")).toBeUndefined()
  })

  it("deletes tokens on explicit delete", () => {
    const store = createMemoryTokenStore()
    store.set("sess-1", "refresh-token-1")
    store.delete("sess-1")
    expect(store.get("sess-1")).toBeUndefined()
  })

  it("evicts expired tokens based on TTL", () => {
    const clock = manualClock(1_000_000)
    const store = createMemoryTokenStore({ ttlSeconds: 60, clock })

    store.set("sess-1", "token-1")
    expect(store.get("sess-1")).toBe("token-1")

    // Advance clock past TTL
    clock.advance(60_001)
    expect(store.get("sess-1")).toBeUndefined()
  })

  it("evicts expired entries and bounds capacity to maxEntries", () => {
    const clock = manualClock(1_000_000)
    const store = createMemoryTokenStore({ maxEntries: 2, ttlSeconds: 100, clock })

    store.set("sess-1", "token-1")
    store.set("sess-2", "token-2")
    expect(store.get("sess-1")).toBe("token-1")
    expect(store.get("sess-2")).toBe("token-2")

    // Adding 3rd entry when full evicts the oldest (sess-1)
    store.set("sess-3", "token-3")
    expect(store.get("sess-1")).toBeUndefined()
    expect(store.get("sess-2")).toBe("token-2")
    expect(store.get("sess-3")).toBe("token-3")
  })

  it("purges expired entries before evicting unexpired entries on capacity breach", () => {
    const clock = manualClock(1_000_000)
    const store = createMemoryTokenStore({ maxEntries: 2, ttlSeconds: 100, clock })

    store.set("sess-1", "token-1")
    clock.advance(50_000)
    store.set("sess-2", "token-2")

    // Now advance past sess-1 expiry (50s + 60s = 110s since sess-1)
    clock.advance(60_000)
    // sess-1 is expired, sess-2 is still valid (60s old, expires in 40s)

    // Inserting sess-3 purges sess-1 instead of evicting sess-2
    store.set("sess-3", "token-3")
    expect(store.get("sess-1")).toBeUndefined()
    expect(store.get("sess-2")).toBe("token-2")
    expect(store.get("sess-3")).toBe("token-3")
  })

  it("validates configuration options", () => {
    expect(() => createMemoryTokenStore({ ttlSeconds: 0 })).toThrowError(AuthError)
    expect(() => createMemoryTokenStore({ ttlSeconds: -10 })).toThrowError(AuthError)
    expect(() => createMemoryTokenStore({ ttlSeconds: 1.5 })).toThrowError(AuthError)
    expect(() => createMemoryTokenStore({ maxEntries: 0 })).toThrowError(AuthError)
    expect(() => createMemoryTokenStore({ maxEntries: -5 })).toThrowError(AuthError)
    expect(() => createMemoryTokenStore({ maxEntries: 2.2 })).toThrowError(AuthError)
  })
})
