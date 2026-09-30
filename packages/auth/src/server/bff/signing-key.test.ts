import { describe, expect, it } from "vitest"
import { isAuthErrorKind } from "../../errors"
import { resolveSigningKey } from "./signing-key"

// No usable signing key may ship in source: a weak or committed key lets anyone forge a session.
// A configured key must be long enough, and a random ephemeral key is minted only when the caller
// explicitly allows it (never in production).

function configError(run: () => unknown): boolean {
  try {
    run()
  } catch (error) {
    return isAuthErrorKind(error, "auth/config")
  }
  return false
}

describe("resolveSigningKey", () => {
  it("uses a configured key of at least 32 bytes", () => {
    const configured = "k".repeat(32)
    const key = resolveSigningKey({ configured, allowEphemeral: false })
    expect(key).toEqual(new TextEncoder().encode(configured))
  })

  it("rejects a short configured key even when ephemeral keys are allowed", () => {
    expect(
      configError(() => resolveSigningKey({ configured: "short", allowEphemeral: true })),
    ).toBe(true)
  })

  it("rejects a missing key unless ephemeral keys are allowed", () => {
    expect(
      configError(() => resolveSigningKey({ configured: undefined, allowEphemeral: false })),
    ).toBe(true)
    expect(configError(() => resolveSigningKey({ configured: "", allowEphemeral: false }))).toBe(
      true,
    )
  })

  it("mints a fresh random 32-byte key when allowed and none is configured", () => {
    const first = resolveSigningKey({ configured: undefined, allowEphemeral: true })
    const second = resolveSigningKey({ configured: undefined, allowEphemeral: true })
    expect(first.byteLength).toBe(32)
    expect(first).not.toEqual(second)
  })

  it("draws the ephemeral key from the injected crypto", () => {
    const bytes = new Uint8Array(32).fill(7)
    const crypto = {
      randomBytes: (length: number) => bytes.slice(0, length),
      digestSha256: () => Promise.reject(new Error("unused")),
      hmacSha256: () => Promise.reject(new Error("unused")),
    }
    expect(resolveSigningKey({ configured: undefined, allowEphemeral: true, crypto })).toEqual(
      bytes,
    )
  })
})
