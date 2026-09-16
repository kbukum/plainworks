import { manualClock } from "@plainworks/testkit"
import { describe, expect, test } from "vitest"
import { createRevocationRegistry } from "./revocation"

function envelope(sid: string | undefined, exp = 1_000) {
  return { v: { sub: "u" }, iat: 1, exp, ...(sid !== undefined ? { sid } : {}) }
}

// The canonical shared manual clock; aliased so the existing call sites read unchanged.
const fakeClock = manualClock

describe("createRevocationRegistry", () => {
  test("passes a session through until its handle is revoked", async () => {
    const registry = createRevocationRegistry({ clock: fakeClock() })
    expect(await registry.isRevoked(envelope("s1"))).toBe(false)
    registry.revoke("s1", 1_000)
    expect(await registry.isRevoked(envelope("s1"))).toBe(true)
    expect(registry.isRevokedSid("s1")).toBe(true)
  })

  test("never revokes a session that carries no handle", async () => {
    const registry = createRevocationRegistry({ clock: fakeClock() })
    registry.revoke("s1", 1_000)
    expect(await registry.isRevoked(envelope(undefined))).toBe(false)
  })

  test("retains a revocation only until the revoked session's expiry", () => {
    const clock = fakeClock(0)
    const registry = createRevocationRegistry({ clock })
    registry.revoke("s1", 1_000)
    clock.set(999_000)
    expect(registry.isRevokedSid("s1")).toBe(true)
    // At the session's own expiry the cookie is already rejected as expired, so the record drops.
    clock.set(1_000_000)
    expect(registry.isRevokedSid("s1")).toBe(false)
  })

  test("keeps the furthest expiry when a handle is re-revoked", () => {
    const clock = fakeClock(0)
    const registry = createRevocationRegistry({ clock })
    registry.revoke("s1", 2_000)
    registry.revoke("s1", 1_000)
    clock.set(1_500_000)
    // Re-revoking with an earlier expiry must never shorten the retained record.
    expect(registry.isRevokedSid("s1")).toBe(true)
  })

  test("does not evict a still-live revocation as more are added", () => {
    const registry = createRevocationRegistry({ clock: fakeClock() })
    registry.revoke("s1", 1_000)
    registry.revoke("s2", 1_000)
    registry.revoke("s3", 1_000)
    expect(registry.isRevokedSid("s1")).toBe(true)
    expect(registry.isRevokedSid("s2")).toBe(true)
    expect(registry.isRevokedSid("s3")).toBe(true)
  })

  test("rejects a non-finite expiry", () => {
    const registry = createRevocationRegistry({ clock: fakeClock() })
    expect(() => registry.revoke("s1", Number.NaN)).toThrowError()
  })

  test("rejects a non-positive maxEntries", () => {
    expect(() => createRevocationRegistry({ maxEntries: 0 })).toThrowError()
  })

  test("fails closed at capacity rather than evicting a live revocation", () => {
    const registry = createRevocationRegistry({ clock: fakeClock(), maxEntries: 2 })
    registry.revoke("s1", 1_000)
    registry.revoke("s2", 1_000)
    // A new handle cannot be admitted while both live records are retained.
    expect(() => registry.revoke("s3", 1_000)).toThrowError()
    expect(registry.isRevokedSid("s1")).toBe(true)
    expect(registry.isRevokedSid("s2")).toBe(true)
    // Re-revoking an already-held handle stays allowed at capacity.
    expect(() => registry.revoke("s1", 2_000)).not.toThrowError()
  })

  test("reclaims capacity from expired records before rejecting", () => {
    const clock = fakeClock(0)
    const registry = createRevocationRegistry({ clock, maxEntries: 1 })
    registry.revoke("s1", 1_000)
    clock.set(1_000_000)
    // s1 has expired, so its slot is reclaimed and s2 is admitted.
    expect(() => registry.revoke("s2", 2_000)).not.toThrowError()
    expect(registry.isRevokedSid("s2")).toBe(true)
    expect(registry.isRevokedSid("s1")).toBe(false)
  })
})
