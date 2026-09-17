import { describe, expect, it } from "vitest"
import { resolveSigningKey } from "./signing-key"

// No usable signing key may ship in the repository: a committed constant would let anyone mint a
// valid `__Host-` session cookie. A deployment supplies the secret; otherwise the key is random.

describe("resolveSigningKey", () => {
  it("uses a configured secret of at least 32 bytes", () => {
    const configured = "s".repeat(32)
    expect(resolveSigningKey(configured)).toEqual(new TextEncoder().encode(configured))
  })

  it("rejects a configured secret that is too short", () => {
    expect(() => resolveSigningKey("too-short")).toThrow(/at least 32 bytes/)
  })

  it("mints a fresh random key when none is configured", () => {
    const first = resolveSigningKey(undefined)
    const second = resolveSigningKey(undefined)
    expect(first.byteLength).toBe(32)
    expect(first).not.toEqual(second)
  })
})
